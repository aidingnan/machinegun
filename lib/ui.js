const blessed = require('blessed')
const screen = blessed.screen({ fullUnicode: true })

const layout = blessed.layout({
  parent: screen,
  width: '100%',
  height: '100%'
})

const blist = blessed.ListTable({
  parent: layout,
  width: '100%',
  height: '50%',
  style: {
    header: { fg: 'yellow', bg: 'black' }
  }
})

const blog = blessed.log({ parent: layout,
  keys: true,
  width: '100%',
  height: '50%',
  focused: true,
  border: { type: 'line' },
  padding: 1,
  label: '帮助：按esc或者Ctrl-c退出程序，上下键或鼠标滚轮可滚动浏览本窗口'
})

screen.key(['escape', 'C-c'], function (ch, key) {
  process.exit(0)
})

screen.on('resize', () => {
  blist.emit('attach')
  blog.emit('attach')
})

screen.render()

module.exports = { blog, blist }
