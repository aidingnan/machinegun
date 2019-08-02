const child = require('child_process')
const readline = require('readline')
const os = require('os')

const Soldiers = new Map()

class Soldier {
  constructor(iface) {
    this.iface = iface
    this.name = iface.name
    this.mac = iface.mac
    this.address = '169.254.'+ this.mac.split(':').slice(3,5).map(x => parseInt(x)).join('.')
    Soldiers.set(this.mac, this)
    this.run()
  }
  
  run() {
    child.exec(`ssh  -o "StrictHostKeyChecking no" root@${this.address} nmcli d wifi connect Xiaomi_123_5G password wisnuc123456`, (err, stdout, stderr) => {
      console.log(this.mac, '  nmcli d wifi: ', err && err.message, stdout && stdout.toString(), stderr)
      child.exec(`ssh  -o "StrictHostKeyChecking no" root@${this.address} mkdir -p /root/mountTest`, (err, stdout, stderr) => {
        console.log(this.mac, '  mkdir -p : ', err && err.message, stdout && stdout.toString(), stderr)
        child.exec(`ssh  -o "StrictHostKeyChecking no" root@${this.address} mount -t btrfs /dev/sda /root/mountTest`, (err, stdout, stderr) => {
          console.log(this.mac, '  mount -t: ', err && err.message, stdout && stdout.toString(), stderr)
          this.startStress()
          this.startIperf()
          this.startDD()
        })
      })
    })
  }

  startStress() {
    let stress = child.spawn('ssh', ['-o', 'StrictHostKeyChecking no', `root@${this.address}`, 'stress-ng', '--cpu', '4', '--io', '4', '--vm-bytes', '128M'])
    let rl = readline.createInterface({ input: stress.stderr })
    rl.on('line', msg => {
      console.log(this.mac, '  stree-ng stderr:  ', msg)
    })
    let rl2 = readline.createInterface({ input: stress.stdout })
    rl2.on('line', msg => {
      console.log(this.mac, '  stree-ng stdout:  ', msg)
    })
  }

  startIperf() {
    let iperf = child.spawn('ssh', ['-o', 'StrictHostKeyChecking no', `root@${this.address}`, 'iperf3', '-s'])
    let rl = readline.createInterface({ input: iperf.stderr })
    rl.on('line', msg => {
      console.log(this.mac, '  iperf stderr:  ', msg)
    })
    let rl2 = readline.createInterface({ input: iperf.stdout })
    rl2.on('line', msg => {
      console.log(this.mac, '  iperf stdout:  ', msg)
    })
  }

  startDD() {
    child.exec(`ssh  -o "StrictHostKeyChecking no" root@${this.address} dd if=/dev/zero of=/root/mountTest/test bs=1M count=10000`, (err, stdout, stderr) => {
      console.log(this.mac, '  dd finished:  ', err && err.message, stdout && stdout.toString(), stderr)
    })
  }

  exit() {
    Soldiers.delete(this.mac)
  }
}


const loop = () => {
  let ifaces = os.networkInterfaces()
  let keys = Object.keys(ifaces).filter(k => k.startsWith('enx'))
  ifaces = keys.map(k => (ifaces[k].forEach(x => x.name = k), ifaces[k]))
               .map(x => x.find(k => k.family === 'IPv4'))
  ifaces.forEach(x => {
    if (!Soldiers.has(x.mac)){
      new Soldier(x)
      console.log('****** find new device: ',x.mac, ' ******')
    }
  })
}
loop()
setInterval(loop, 10 * 1000)