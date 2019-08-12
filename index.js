const EventEmitter = require('events')
const fs = require('fs')
const child = require('child_process')
const crypto = require('crypto')
const http = require('http')
const os = require('os')

const blessed = require('blessed')
const screen = blessed.screen({ fullUnicode: true })

const header = ['DEVICE', '#STRESS', '#EMMC', 'READ', 'SPEED', 'WRITE', 'SPEED', '#SATA', 'READ', 'SPEED', 'WRITE', 'SPEED', '#WIFI', 'DOWNLOAD', 'SPEED']

const layout = blessed.layout({
  parent: screen,
  width: '100%',
  height: '100%' 
})

const blist = blessed.ListTable({
  parent: layout,
  width: '100%',
  height: '50%',
  data: [ header ]
})

const blog = blessed.log({ parent: layout,
  keys: true,
  width: '100%',
  height: '50%',
  focused: true,
})

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  process.exit(0);
})

/**
screen.on('resize', () => {
  blist.emit('attach')
  blog.emit('attach')
})
*/

screen.render();

// stress-ng  continous
// mbw        repeating
// download   repeating
// dd emmc    repeating
// dd sata    repeating
// bluetooth  oneshot
// led        not applicable

// format rate: 'NNN.N MB/s' length 10

/**
process.stdout.write('\033[2J\033[;H')
console.log('设备              | 压力测试 | EMMC测试                                             | SATA测试                                             | WiFi测试') 
let hs = []
hs.push(' '.padEnd(17, ' '))
hs.push('状态'.padEnd(6, ' '))
hs.push('状态')
hs.push('写入次数'.padStart(8 - 4, ' '))
hs.push('速度'.padStart(10 - 2, ' '))
hs.push('读取次数'.padStart(8 - 4, ' '))
hs.push('速度'.padStart(10 - 2, ' '))
hs.push('状态')
hs.push('写入次数'.padStart(8 - 4, ' '))
hs.push('速度'.padStart(10 - 2, ' '))
hs.push('读取次数'.padStart(8 - 4, ' '))
hs.push('速度'.padStart(10 - 2, ' '))
hs.push('状态')
hs.push('下载次数'.padStart(8 - 4, ' '))
hs.push('速度'.padStart(10 - 2, ' '))
console.log(hs.join(' | '))
console.log(''.padEnd(169, '-'))

*/

// blist.setRows([ header ])
// screen.render()

const strip = string => string.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g, '')

const _log = fs.createWriteStream('log', { flags: 'a'})
const logWrite = string => _log.write(string)
const log = string => _log.write(string + '\n')

const Soldiers = new Map()

class StressNg extends EventEmitter {
  constructor (address) {
    super()
    this.address = address
    this.child = child.spawn('ssh', ['-o', 'StrictHostKeyChecking no', '-tt', `root@${this.address}`, 'stress-ng', '--cpu', '4', '--io', '4', '--vm-bytes', '128M'])

    this.child.stdout.once('data', data => this.emit('tick'))
    this.child.on('error', err => {
      this.child.removeAllListeners()
      this.child.on('error', err => {})
      this.child.kill()
      this.error = err
      this.child = null
    })

    this.child.on('close', (code, signal) => {
      this.child.removeAllListeners()
      let err = new Error('unexpected close')
      err.code = code
      err.signal = signal
      this.error = err
      this.child = null
    })
  }

  destroy () {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  } 

  brief () {
    let s = this.child ? '运行' : this.error ? '错误' : '停止'
    return { s }
  }
}

class WifiTest extends EventEmitter {
  constructor (address, hostAddress, ssid, password) {
    super()
    this.address = address
    this.results = []
    this.child = child.exec(`ssh  -o "StrictHostKeyChecking no" -tt root@${this.address} nmcli d wifi connect ${ssid} password ${password}`, (err, stdout) => {
      if (err) {
        // console.log(err)
        this.child = null
        this.error = err
      } else {
        let out = strip(stdout.toString()).trim() 
        if (out.includes('successfully activated')) {
          const run = () => {
            let start = new Date().getTime()
            // note the double escape, one is escaping vertical pipe and the other is escaping the first one, which is required by js template literal
            let cmd = `ssh -o "StrictHostKeyChecking no" -tt root@${this.address} wget --quiet -O - http://10.10.9.75:3000 \\| sha256sum`
            this.child = child.exec(cmd, (err, stdout) => {
              if (err) {
                this.child = null
                this.error = err
                // console.log(err)
                process.exit(1)
              } else {
                // TODO check sha256
                let end = new Date().getTime()
                let dur = (end - start) / 1000
                let rate = `${1024 / dur} MB/s`
                this.results.push(rate)
                this.emit('tick')
                run()
              }
            })
          }
          run()
        } else {
          let err = new Error(out)
          this.child = null
          this.error = err
        }
      }
    })
  }

  brief () {
    let s = this.child 
      ? '运行'
      : this.error
        ? '错误'
        : '停止'

    let avg = this.results.length
      ? this.results
          .map(r => parseInt(r.trim().split(' ')[0]))
          .reduce((sum, n) => sum + n, 0) / this.results.length
      : 0

    let rate = `${avg.toFixed(1).toString()} MB/s`
    let time = this.results.length.toString()

    return { s, dRate: rate, dTime: time }
  }
}

class EmmcTest extends EventEmitter {
  constructor (address) {
    super()
    this.address = address
    this.results = []
    let ocmd = `ssh -o "StrictHostKeyChecking no" -tt root@${this.address} dd if=/dev/zero of=/root/test bs=4M count=256 oflag=direct`
    let icmd = `ssh -o "StrictHostKeyChecking no" -tt root@${this.address} dd if=/root/test of=/dev/null bs=4M count=256 iflag=direct`
    const run = () => {
      let cmd = this.results.length > 1 ? icmd : ocmd
      this.child = child.exec(cmd, (err, stdout) => {
        if (err) {
          this.child = null
          this.error = err
        } else {
          let rate = strip(stdout.toString())
            .split('\n')
            .find(l => l.includes('copied'))
            .trim()
            .split(',')
            .pop()
            .trim()
          this.results.push(rate)
          this.emit('tick')
          run()
        }
      })
    }
    run()
  }

  brief () {
    let s = this.child ? '运行' : this.error ? '错误' : '停止'

    let ws = this.results.slice(0, 2)
    let rs = this.results.slice(2)

    let wAvg = ws.length
      ? ws.map(r => parseInt(r.trim().split(' ')[0])) 
          .reduce((sum, n) => sum + n, 0) / ws.length
      : 0
    let rAvg = rs.length
      ? rs.map(r => parseInt(r.trim().split(' ')[0])) 
          .reduce((sum, n) => sum + n, 0) / rs.length
      : 0

    let wRate = `${wAvg.toFixed(1).toString()} MB/s`
    let wTime = ws.length.toString()
    let rRate = `${rAvg.toFixed(1).toString()} MB/s`
    let rTime = rs.length.toString()
    return { s, wTime, wRate, rTime, rRate }
  }
}

class SataTest extends EventEmitter {
  constructor (address) {
    super ()
    this.address = address
    this.results = []
    let ocmd = `ssh -o "StrictHostKeyChecking no" -tt root@${this.address} dd if=/dev/zero of=/run/sata/test bs=4M count=256 oflag=direct`
    let icmd = `ssh -o "StrictHostKeyChecking no" -tt root@${this.address} dd if=/run/sata/test of=/dev/null bs=4M count=256 iflag=direct`
    this.child = child.exec(`ssh -o "StrictHostKeyChecking no" -tt root@${this.address} mkdir -p /run/sata`, err => {
      if (err) {
        this.child = null
        this.error = err
        return
      }

      this.child = child.exec(`ssh -o "StrictHostKeyChecking no" -tt root@${this.address} mount -t btrfs /dev/sda /run/sata`, err => {
        const run = () => {
          let cmd = this.results.length > 1 ? icmd : ocmd 
          this.child = child.exec(cmd, (err, stdout) => {
            if (err) {
              this.child = null
              this.error = err
            } else {
              let rate = strip(stdout.toString())
                .split('\n')
                .find(l => l.includes('copied'))
                .trim()
                .split(',')
                .pop()
                .trim()

              this.results.push(rate)
              this.emit('tick')
              run()
            }
          })
        }
        run()
      })
    })
  }

  brief () {
    let s = this.child 
      ? '运行'
      : this.error
        ? '错误'
        : '停止'

    let ws = this.results.slice(0, 2)
    let rs = this.results.slice(2)

    let wAvg = ws.length
      ? ws.map(r => parseInt(r.trim().split(' ')[0])) 
          .reduce((sum, n) => sum + n, 0) / ws.length
      : 0
    let rAvg = rs.length
      ? rs.map(r => parseInt(r.trim().split(' ')[0])) 
          .reduce((sum, n) => sum + n, 0) / rs.length
      : 0

    let wRate = `${wAvg.toFixed(1).toString()} MB/s`
    let wTime = ws.length.toString()
    let rRate = `${rAvg.toFixed(1).toString()} MB/s`
    let rTime = rs.length.toString()
   
    return { s, wTime, wRate, rTime, rRate }
  }
}

class Soldier extends EventEmitter {
  constructor(iface, ssid, password) {
    super()
    this.iface = iface
    this.ssid = ssid
    this.password = password
    this.name = iface.name
    this.mac = iface.mac
    this.address = '169.254.'+ this.mac.split(':').slice(3,5).map(x => parseInt(x)).join('.')
    Soldiers.set(this.mac, this)
    this.run()
  }
  
  run() {
    this.stressNg = new StressNg(this.address)
    this.stressNg.on('tick', () => this.emit('tick'))
    this.wifi = new WifiTest(this.address, null, this.ssid, this.password)
    this.wifi.on('tick', () => this.emit('tick'))
    this.emmc = new EmmcTest(this.address)
    this.emmc.on('tick', () => this.emit('tick'))
    this.sata = new SataTest(this.address)
    this.sata.on('tick', () => this.emit('tick'))
  }

  exit() {
    Soldiers.delete(this.mac)
  }

  brief () {
    let bs = [] 
    bs.push(this.mac)
    bs.push(this.stressNg.brief())
    bs.push(this.emmc.brief())
    bs.push(this.sata.brief())
    bs.push(this.wifi.brief())
    return bs
  }
}

let duration = 10
let testBluetooth = true
let ssid, password
let hostAddress
let digest

fs.readFile('config.json', (err, json) => {
  if (err) throw err
  let config = JSON.parse(json)   

  if (Number.isInteger(config.duration) && config.duration > 0) {
    duration = config.duration
  } else {
    durtion = 10
  }

  testBluetooth = !!config.testBluetooth
  ssid = config.wifi && config.wifi.ssid
  password = config.wifi && config.wifi.password

  if (!ssid || !password) throw new Error('配置文件未提供可用的wifi配置')
  blog.log('本次测试使用如下配置：')
  blog.log(`  测试时间：${duration}分钟 （该设置尚未生效）`)
  blog.log(`  ${testBluetooth ? '' : '不'}测试蓝牙 （代码尚未支持）`)
  blog.log(`  wifi：${ssid}`)
  blog.log(`  wifi密码：${password}`)

  const random = next => fs.lstat('random', (err, stats) => {
    if (err && err.code === 'ENOENT') {
      blog.log('生成测试文件用于wifi文件传输测试')
      crypto.randomFill(Buffer.alloc(1024 * 1024), (err, rbuf) => {
        let hash = crypto.createHash('sha256')
        let ws = fs.createWriteStream('random')
        for (let i = 0; i < 1024; i++) {
          ws.write(rbuf)  
          hash.update(rbuf)
        } 
        ws.end()
        digest = hash.digest('hex')
        next()
      }) 
    } else if (err) {
      throw err
    } else {
      if (!stats.isFile() || stats.size !== 1024 * 1024 * 1024) {
        blog.log('已有测试文件类型或大小错误，重建测试文件') 
        fs.unlink('random', err => {
          if (err) {
            throw err
          } else {
            random()
          }
        })
      } else {
        blog.log('计算测试文件哈希值')
        let rs = fs.createReadStream('random')
        let hash = crypto.createHash('sha256')
        rs.on('data', data => hash.update(data))
        rs.on('end', () => {
          digest = hash.digest('hex')
          next()
        })
      }
    }
  })

  random(() => {
    const server = http.createServer((req, res) => { 
      const rs = fs.createReadStream('random')
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      rs.pipe(res)
    })
    server.listen(3000, () => {
      blog.log('本机（作为文件下载服务器）开始侦听3000端口')
      blog.log('测试开始')
    })

    const loop = () => {
      let ifaceObj = os.networkInterfaces()
      let ifaces = []
      for (var key in ifaceObj) {
        if (key.startsWith('enx')) {
          let ipv4 = ifaceObj[key].find(x => x.family === 'IPv4')
          if (ipv4) {
            ifaces.push(Object.assign({}, ipv4, { name: key }))
          } 
        }
      }

      ifaces.forEach(x => {
        if (!Soldiers.has(x.mac)){
          let s = new Soldier(x, ssid, password)
          s.on('tick', () => {
            // process.stdout.write('\033[2J\033[;H')
            // console.log('设备              | 压力测试 | EMMC测试                                             | SATA测试                                             | WiFi测试') 
            let hs = []
            hs.push(' '.padEnd(17, ' '))
            hs.push('状态'.padEnd(6, ' '))
            hs.push('状态')
            hs.push('写入次数'.padStart(8 - 4, ' '))
            hs.push('速度'.padStart(10 - 2, ' '))
            hs.push('读取次数'.padStart(8 - 4, ' '))
            hs.push('速度'.padStart(10 - 2, ' '))
            hs.push('状态')
            hs.push('写入次数'.padStart(8 - 4, ' '))
            hs.push('速度'.padStart(10 - 2, ' '))
            hs.push('读取次数'.padStart(8 - 4, ' '))
            hs.push('速度'.padStart(10 - 2, ' '))
            hs.push('状态')
            hs.push('下载次数'.padStart(8 - 4, ' '))
            hs.push('速度'.padStart(10 - 2, ' '))
            // console.log(hs.join(' | '))
            // console.log(''.padEnd(169, '-'))
/*
            Array.from(Soldiers).forEach(kv => {
              let bs = kv[1].brief() 
              let ds = []
              ds.push(bs[0].padEnd(17, ' '))
              ds.push(bs[1].s.padEnd(6, ' '))
              ds.push(bs[2].s)
              ds.push(bs[2].wTime.padStart(8, ' '))
              ds.push(bs[2].wRate.padStart(10, ' '))
              ds.push(bs[2].rTime.padStart(8, ' '))
              ds.push(bs[2].rRate.padStart(10, ' '))
              ds.push(bs[3].s)
              ds.push(bs[3].wTime.padStart(8, ' '))
              ds.push(bs[3].wRate.padStart(10, ' '))
              ds.push(bs[3].rTime.padStart(8, ' '))
              ds.push(bs[3].rRate.padStart(10, ' '))
              ds.push(bs[4].s)
              ds.push(bs[4].dTime.padStart(8, ' '))
              ds.push(bs[4].dRate.padStart(10, ' '))
              // console.log(ds.join(' | '))
            })
*/

          })
        }
      })
    }

    loop()
    setInterval(loop, 3000)
  })
})


