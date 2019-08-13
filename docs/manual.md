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

## 使用

在machinegun目录下运行，需要`sudo`。

```
sudo node index.js
```

## 已知问题

- 尚无测试结束定义
- 拔除设备时程序错误退出