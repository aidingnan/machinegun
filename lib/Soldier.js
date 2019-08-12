const EventEmitter = require('events')
const child = require('child_process')

const { blog, blist } = require('./ui')

const strip = string => string.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g, '')

class StressNg extends EventEmitter {
  constructor (address) {
    super()
    this.address = address
    this.child = child.spawn('ssh', ['-o', 'StrictHostKeyChecking no', '-tt', `root@${this.address}`, 'stress-ng', '--cpu', '4', '--io', '4', '--vm-bytes', '128M'])
    this.child.stdout.once('data', data => {
      blog.log(`${this.address}`, '开始压力测试')
      this.emit('tick')
    })

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
    let s = this.child ? '运行' : this.error ? '错误' : '停止'
    let avg = this.results.length ? this.results .map(r => parseInt(r.trim().split(' ')[0])) .reduce((sum, n) => sum + n, 0) / this.results.length : 0
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
      blog.log(`${this.address}`, `第${this.results.length + 1}次读写测试`)
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
    let wAvg = ws.length ? ws.map(r => parseInt(r.trim().split(' ')[0])) .reduce((sum, n) => sum + n, 0) / ws.length : 0
    let rAvg = rs.length ? rs.map(r => parseInt(r.trim().split(' ')[0])) .reduce((sum, n) => sum + n, 0) / rs.length : 0
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
    let s = this.child ? '运行' : this.error ? '错误' : '停止'
    let ws = this.results.slice(0, 2)
    let rs = this.results.slice(2)
    let wAvg = ws.length ? ws.map(r => parseInt(r.trim().split(' ')[0])) .reduce((sum, n) => sum + n, 0) / ws.length : 0
    let rAvg = rs.length ? rs.map(r => parseInt(r.trim().split(' ')[0])) .reduce((sum, n) => sum + n, 0) / rs.length : 0
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
    this.name = iface.name
    this.mac = iface.mac
    this.address = iface.buddyIp
    this.ssid = ssid
    this.password = password
    this.name = iface.name
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
    bs.push(this.address)
    bs.push(this.stressNg.brief())
    bs.push(this.emmc.brief())
    bs.push(this.sata.brief())
    bs.push(this.wifi.brief())
    return bs
  }
}

module.exports = Soldier
