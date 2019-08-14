const EventEmitter = require('events')
const fs = require('fs')
const child = require('child_process')
const crypto = require('crypto')
const http = require('http')
const os = require('os')

const validator = require('validator')

const ifacemon = require('./lib/iface-monitor')
const { blog, blist } = require('./lib/ui')
const Soldier = require('./lib/Soldier')

// format rate: 'NNN.N MB/s' length 10

// const isValidSSID = str => /^[!#;].|[+\[\]/"\t\s].*$/.test(str)
// const isValidWPA = str => /^[\u0020-\u007e\u00a0-\u00ff]*$/.test(str)

const Soldiers = new Map()

let duration = 10
let testBluetooth = false
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

  // testBluetooth = !!config.testBluetooth
  ssid = config.wifi && config.wifi.ssid
  password = config.wifi && config.wifi.password
  hostAddress = config.hostAddress

  if (typeof hostAddress !== 'string' || !validator.isIP(hostAddress, 4)) {
    throw new Error('hostAddress配置不合法')
  }

  if (typeof ssid !== 'string' || ssid.length === 0) {
    throw new Error('wifi.ssid配置不合法')
  }

  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('wifi.password配置不合法')
  }

  blog.log('本次测试使用如下配置：')
  blog.log(`  ${testBluetooth ? '' : '不'}测试蓝牙 （代码尚未支持）`)
  blog.log(`  wifi：${ssid}`)
  blog.log(`  wifi密码：${password}`)
  blog.log(`  本机服务地址：${hostAddress}`)

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
        blog.log('测试文件生成完毕')
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
        next()
        blog.log('计算测试文件哈希值')
        let rs = fs.createReadStream('random')
        let hash = crypto.createHash('sha256')
        rs.on('data', data => hash.update(data))
        rs.on('end', () => {
          digest = hash.digest('hex')
          blog.log('测试文件哈希值计算完毕')
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
    })
  })
})

ifacemon.on('add', iface => {
  blog.log(`${iface.buddyIp} 发现新设备`)
  let soldier = new Soldier(iface, ssid, password, hostAddress)
  soldier.on('tick', () => {
    let data = []
    let hs = []
    hs.push('设备地址'.padEnd(7, ' '))
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
    data.push(hs)
    Array.from(Soldiers).forEach(kv => {
      let bs = kv[1].brief()
      let ds = []
      ds.push(bs[0].padEnd(15, ' '))
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
      data.push(ds)
    })

    blist.setData(data)
  })
  Soldiers.set(iface.mac, soldier)
})

ifacemon.on('remove', iface => {
  let soldier = Soldiers.get(iface.mac)
  if (soldier) {
    soldier.destroy()
    Soldiers.delete(iface.mac)
  }
})
