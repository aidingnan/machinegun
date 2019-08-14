# 重要！！！

测试性能与发布版本密切相关：

请使用如下版本测试：

https://github.com/aidingnan/rockbian/releases/tag/v1.1.12-beta.12

该版本使用：

1. 400/600/800/1000 MHz CPU主频
1. 75/85/115摄氏度的thermal trip points；
2. wifi powersaving off

对应的rockchip loader和emmc头部文件请从下述链接获取：

https://github.com/aidingnan/rockbian-boot/releases/tag/v1.0.1

# 使用手册

因为是研发工具，就不做打包了。需要预装的软件和配置均使用本文档说明。

## 系统要求

要求Linux主机，实际测试仅测试了Ubuntu 19.04版本。代码对Linux的要求如下：

udev会对热插拔的网卡进行重命名，命名规则是使用该设备的MAC地址命名的网卡名称，该名称在设备的udev属性里称为`ID_NET_NAME_MAC`，例如

```
enx98e8fb5176e9
```

## node.js安装

脚本使用node.js编写，操作系统需要有node.js的运行和编译环境；

Node.js在Ubuntu上有nodejs包，但node开发一般不安装发行版的包，而是直接安装官方包，下载后展开到`/usr`目录即可。如果已经安装了发行版里的nodejs，需要先卸载。

```
wget https://nodejs.org/dist/v10.16.2/node-v10.16.2-linux-x64.tar.xz
tar xf node-v10.16.2-linux-x64.tar.xz -C /usr --strip-components=1
```

除了运行时，还需要安装node的模块编译环境，因为udev依赖的二进制模块需要编译。

```
sudo apt install libudev-dev build-essential python2.7
```

## 使用git安装本软件

```
git clone https://github.com/aidingnan/machinegun
```

git clone完成后，先检查一下本机的python安装是否正确，如果正确，python命令如下所示可用。

```
$ python
Python 2.7.16 (default, Apr  6 2019, 01:42:57) 
[GCC 8.3.0] on linux2
Type "help", "copyright", "credits" or "license" for more information.
>>> exit()
$ 
```

如果不正确，看一下`/usr/bin`目录下是否有python，`/usr/bin/python2.7`应该存在。

```
ls /usr/bin/python* -sail
```

```
cd machinegun

# 如果python路径正确
npm install

# 如果python路径不正确
PYTHON=/usr/bin/python2.7 npm install
```

## 配置SSH证书

Backus设备刚刚刷机之后处于工程模式（engineering），在该模式下，系统内置的SSH证书生效，即Linux主机正确配置证书后，可跳过ssh命令的对方身份提示和输入密码过程。

`machinegun`脚本采用该方式工作，因此需要配置SSH证书。

SSH证书的下载位置是：

```
https://github.com/aidingnan/rockbian/blob/master/keys/id_rsa
```

该文件需要保存为`/root/.ssh/id_rsa`。该文件和目录均有权限要求，否则ssh-agent会拒绝使用

- `/root/.ssh`目录必须为`700`
- `/root/.ssh`目录必须为`600`或者`640`

```
sudo chmod 700 /root/.ssh
sudo chmod 600 /root/.ssh/id_rsa
```

如果配置后未能立刻生效可重启电脑。

## NetworkManager配置

主流Linux发行版都使用NetworkManager管理网络。理论上可以通过NetworkManager的配置文件为USB RNDIS设备配置IP地址，实际测试发现NM配置的Link-Local地址只能路由一个，即如果插上多个Backus设备，系统在没有手工配置的情况下只能访问其中一个设备。

`machinegun`使用代码来查找设备并配置其网络，需要禁止NetworkManager管理USB RNDIS设备。

在Ubuntu上，编辑NM的udev规则文件：

```
/lib/udev/rules.d/85-nm-unmanaged.rules
```

在最后一句`LABEL="nm_unmanaged_end"`之前添加以下内容：

```
# Dingnan Backus USB RNDIS
ATTR{address}=="98:e8:fb:*", ENV{NM_UNMANAGED}="1"
```

Backus设备的USB RNDIS使用一致的OUI（`98:e8:fb`），该规则可以禁止NetworkManager管理所有钉南Backus设备的USB RNDIS网卡；同时不影响主机其他网卡的使用。

完成配置后需要重启电脑。（用systemd重启udev服务可能不工作）

## SATA SSD

SATA SSD需要预先格式化成btrfs文件系统，无分区表。测试前应该安装到Backus板子上。测试软件不会格式化SSD。

## 软件配置

在目录下有一个`config.json`文件，是json格式的配置文件。示例如下：

```json
{
  "duration": 10,
  "testBluetooth": false,
  "wifi": {
    "ssid": "Xiaomi_123_5G",
    "password": "wisnuc123456"
  },
  "hostAddress": "10.10.9.75"
}
```

- `duration`，尚未使用；
- `testBluetooth`，尚未支持；
- `wifi.ssid`，测试时被测设备需要接入的wifi的ssid；
- `wifi.password`，测试时被测设备需要介入的wifi的密码；
- `hostAddress`，wifi测试时，主机（本机）服务的ip地址；

根据测试环境情况修改好配置文件保存。建议使用支持json格式检查的编辑器，如果格式错误程序无法启动。

## 使用

在machinegun目录下运行，需要`sudo`。

```
sudo node index.js
```

## 已知问题

- 尚无测试结束定义
- 在设备断开时程序退出
    - 拔出设备时会发生
    - 偶见设备的USB重连，重连的USB，之前命令的history都在，没有重启时间；重启的设备有大约10秒钟的启动时间，之前命令的history全部丢失；可以根据此现象判断是发生了重启还是重连

## 其他

目前设备连接主机后，如果前述NetworkManager的udev rule配置生效，则可以用下述命令看到，注意必须提供`-a`参数。

```
$ ifconfig -a
...

enx98e8fb5176e9: flags=4098<BROADCAST,MULTICAST>  mtu 1500
        ether 98:e8:fb:51:76:e9  txqueuelen 1000  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 0  bytes 0 (0.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

...
```

`machinegun`启动后会自动检查到这类设备（特征是ether地址以`98:e8:fb`开始），并自动启动该网卡，配置ip地址和配置route；在多个设备同时插入时，这是能够正确route的唯一办法。

在`machinegun`启动之后，可以用下述命令看到USB RNDIS网卡的网络配置。

```
$ ifconfig
...
enx98e8fb5176e9: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 169.254.100.100  netmask 255.255.0.0  broadcast 169.254.255.255
        inet6 fe80::9ae8:fbff:fe51:76e9  prefixlen 64  scopeid 0x20<link>
        ether 98:e8:fb:51:76:e9  txqueuelen 1000  (Ethernet)
        RX packets 162  bytes 25820 (25.8 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 184  bytes 45249 (45.2 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
...

$ route -n
$ route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         10.10.9.1       0.0.0.0         UG    600    0        0 wlp2s0
10.10.9.0       0.0.0.0         255.255.255.0   U     600    0        0 wlp2s0
169.254.0.0     0.0.0.0         255.255.0.0     U     0      0        0 enx98e8fb5176e9
169.254.0.0     0.0.0.0         255.255.0.0     U     1000   0        0 wlp2s0
169.254.51.76   0.0.0.0         255.255.255.255 UH    0      0        0 enx98e8fb5176e9
```

例子中显示RNDIS网卡的主机IP地址配置为169.254.100.100，是主机的RNDIS地址；网卡名称是enx98e8fb5176e9，这是udev重命名过的网卡名称，使用了enx前缀加上mac地址；

Backus设备在设备一端，根据设备的序列号产生了固定的设备端mac地址和固定的主机mac地址（这是RNDIS和USB CDC网络设备支持的）；同时设备端使用固定的IP地址，其IP地址后面两位，与主机mac地址的倒数第三位和倒数第二位相同；上述显示中ether是主机的mac地址，倒数第三位和倒数第二位分别是`51:76`，所以设备的IP地址为`169.254.51.76`；

>从mac地址和ip地址的格式上说，前者是16进制，后者是10进制，但不需要做转换；设备端的生成地址的算法保证了两者在字符串的表示上是一致的，而且范围一定在两位数之内。

路由表中最后一条的含义是：

对于发送给`169.254.51.76`的数据包，走`enx98e8fb5176e9`网卡接口，这是machinegun的代码定义的。

在上述ssh证书配置完成后，在配置好网络后，包括测试时，可以直接使用ssh命令进入设备：

```
ssh root@169.254.51.76
ssh -o "StrictHostKeyChecking no" root@169.254.51.76
```

使用第二种方式可以跳过`yes/no`的主机身份提示问题，脚本中采用了这种方式执行命令。

在进入主机后，下述命令可以查看cpu温度和cpu频率：

```
watch cat /sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_cur_freq
watch cat /sys/class/thermal/thermal_zone0/temp
```

dts的soc-thermal配置可以在下述目录中看到：

```
$ ls /proc/device-tree/thermal-zones/soc-thermal/trips/
...
539 0 drwxr-xr-x 2 root root 0 Feb 14 18:32 soc-crit
528 0 drwxr-xr-x 2 root root 0 Feb 14 18:32 trip-point0
533 0 drwxr-xr-x 2 root root 0 Feb 14 18:32 trip-point1
...
```

在这三个目录内都有一个`temperature`文件，内容是二进制格式的温度设置，可以通过下述命令查看。（需要安装`xxd`包）

```
$ echo $((0x$(xxd -p temperature)))
95000
```

trip point0/1和soc-crit分别对应threshold, target和soc_crit三个点；

温度超过threshold时thermal driver开始降频；温度超过target时thermal driver仅使用最低主频；温度达到soc_crit时cpu重启。

cpu governor的文件节点位于：

```
/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
/sys/devices/system/cpu/cpu1/cpufreq/scaling_governor
/sys/devices/system/cpu/cpu2/cpufreq/scaling_governor
/sys/devices/system/cpu/cpu3/cpufreq/scaling_governor
```

缺省配置为`ondemand`。

hotplug cpu可以使用下述文件节点：

```
/sys/devices/system/cpu/cpu0/online
/sys/devices/system/cpu/cpu1/online
/sys/devices/system/cpu/cpu2/online
/sys/devices/system/cpu/cpu3/online

# example
echo 1 > /sys/devices/system/cpu/cpu3/online
echo 0 > /sys/devices/system/cpu/cpu3/online
```

尽量不要hotplug cpu0。

