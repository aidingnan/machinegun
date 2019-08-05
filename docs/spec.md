# Spec

本文档描述Backus硬件合格测试标准，该标准为产品设计合规要求，不用于产线测试。

## 测试项目

1. CPU压力
2. 内存压力
3. emmc读写
4. sata读写
5. wifi传输
6. 蓝牙广播
7. LED灯
8. USB 2.0接口

测试要求为1-5测试项目为并发测试，并发测试可以让系统处于最高功耗状态，可检验在满载压力下电源设计是否可以承受。

并发测试时间至少为10分钟。

6/7测试需要人工测试，暂不列入自动化测试范围。

8不做独立测试，但要求通过USB 2.0接口的eMMC镜像烧录正常，烧录后的设备可以正常启动；否则判定为USB 2.0接口有设计或生产缺陷。

## 镜像

镜像要求使用`v1.1.0-beta0`之后的版本。

系统镜像在刷机后处于`engineering`模式，`winasd`应用不启动。测试在该模式下完成。

## 蓝牙测试

在ssh命令行下执行`hciconfig -a`命令，获得蓝牙地址（`BD Address`）：

```
# hciconfig -a
hci0:	Type: Primary  Bus: UART
	BD Address: CC:4B:73:3D:1C:5F  ACL MTU: 1021:8  SCO MTU: 64:1
	UP RUNNING 
	RX bytes:3877 acl:0 sco:0 events:387 errors:0
	TX bytes:59821 acl:0 sco:0 commands:387 errors:0
	Features: 0xbf 0xfe 0xcf 0xfe 0xdb 0xff 0x7b 0x87
	Packet type: DM1 DM3 DM5 DH1 DH3 DH5 HV1 HV2 HV3 
	Link policy: RSWITCH SNIFF 
	Link mode: SLAVE ACCEPT 
	Name: 'pan-4549'
	Class: 0x000000
	Service Classes: Unspecified
	Device Class: Miscellaneous, 
	HCI Version: 4.2 (0x8)  Revision: 0x118
	LMP Version: 4.2 (0x8)  Subversion: 0x6119
	Manufacturer: Broadcom Corporation (15)
```

在ssh命令行下执行`mimic-ibeacon`命令

在Android或iOS手机上使用蓝牙搜索软件，可使用内置蓝牙搜索，推荐使用`lightblue`，可以搜索到上述蓝牙地址的设备；

如果使用`lightblue`软件，能看到设备名称为`BCM43455 3`。

搜到所述地址的蓝牙设备即可认为蓝牙测试通过。

该测试可用于量产测试。

## LED测试

在ssh命令行下执行`aw2015 rotate 5`，可看到LED灯依次闪烁绿色/蓝色/红色，循环5次。看到三色循环即为测试通过。

如果有颜色缺失则判定为器件或焊接不良。

该测试可用于量产测试。

## 自动化测试

本项目为自动化测试脚本，使用`node.js`书写，主机需要安装`node.js`。

### 自动化测试方法

在脚本中并发运行下述测试：

1. 使用stress-ng在目标设备上执行cpu和内存压力测试
2. 使用iperf在目标设备和主机上执行client-server模式的网络传输测试，该测试在未来可能用下载上传替代，便于统计性能。
3. 使用dd命令在sata设备上循环写入文件；

目前脚本中尚无emmc的读写测试，会在本周加入。

自动化测试时设备电流很大，务必保障设备供电。 

### 安装node.js

可以使用Linux发行版的nodejs包，推荐从nodejs.org网站上下载二进制包，直接解压到`/usr`目录下。

例如：

```
wget https://nodejs.org/dist/v10.16.1/node-v10.16.1-linux-x64.tar.xz
tar xf node-v10.16.1-linux-x64.tar.xz -C /usr --strip-components=1
```

安装后，`node --version`可以看到node的版本。

### 下载和安装本项目

```
git clone https://github.com/aidingnan/machinegun
cd machinegun
npm i
```

最后一句`npm i`是安装node.js项目的依赖包。

### 运行

在`machinegun`目录下执行`node index.js`即可。

目前脚本功能尚未全部完成。


