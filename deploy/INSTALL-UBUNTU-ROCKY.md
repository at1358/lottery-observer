# Ubuntu 24.04 / Rocky Linux 9 部署脚本

支持 **Ubuntu 24.04 LTS** 和 **Rocky Linux 9.x 当前稳定维护版本**，架构为 x86_64 或 ARM64。Rocky 脚本检查主版本 9，不写死 9.8 等点版本。系统软件来自本发行版稳定仓库；Node 从官方取得最新 **24 LTS** 补丁并校验 SHA256，最低 24.19.0。

脚本安装应用，不安装或升级操作系统，也不自动重启主机。请使用已更新的目标系统镜像。实际安装需要 root/sudo、联网和 systemd；不适用于没有 systemd 的 Docker 容器。推荐至少 2 核 CPU、4 GB 内存用于本机源码构建；小内存服务器可采用预构建运行包。

## 1. 获取源码

如果还没有 Git，Ubuntu 执行 `sudo apt-get update && sudo apt-get install -y git`；Rocky 执行 `sudo dnf install -y git`。随后：

```sh
git clone https://github.com/at1358/lottery-observer.git
cd lottery-observer
```

私有仓库需要你自己的 GitHub 授权。无需在脚本内填写 GitHub 令牌。

## 2. 先看安装计划

将域名换成你的真实域名。`--dry-run` 不安装软件、不改系统文件，也不生成密钥：

```sh
# Ubuntu 24.04
bash deploy/ubuntu-24.04.sh --domain observer.example.com --http-only --dry-run

# Rocky Linux 9.x
bash deploy/rocky-9.sh --domain observer.example.com --http-only --dry-run
```

## 3. 正式 HTTPS 部署

先把域名解析到服务器，并准备与域名匹配的完整证书链和无密码私钥。脚本检查证书有效期、域名和私钥匹配，复制到系统标准证书目录并生成 HTTP → HTTPS 跳转。

```sh
# Ubuntu 24.04
sudo bash deploy/ubuntu-24.04.sh \
  --domain observer.example.com \
  --tls-cert /path/to/fullchain.pem \
  --tls-key /path/to/privkey.pem

# Rocky Linux 9.x（选择与你服务器一致的一条）
sudo bash deploy/rocky-9.sh \
  --domain observer.example.com \
  --tls-cert /path/to/fullchain.pem \
  --tls-key /path/to/privkey.pem
```

证书不会自动申请或续期。脚本使用复制后的证书，续期后应更新受管证书文件并执行 `sudo nginx -t && sudo systemctl reload nginx`，或重新执行相同安装命令。Ubuntu 的受管证书在 `/etc/ssl/certs/period-observer-fullchain.pem` 和 `/etc/ssl/private/period-observer-key.pem`；Rocky 的对应位置在 `/etc/pki/tls/certs/` 和 `/etc/pki/tls/private/`。

没有证书时，可以明确选择 HTTP 做首次连通测试：

```sh
sudo bash deploy/ubuntu-24.04.sh --domain 你的服务器IPv4 --http-only
# 或
sudo bash deploy/rocky-9.sh --domain 你的服务器IPv4 --http-only
```

HTTP 模式不加密账号密码，仅用于受控测试。公开正式访问请改为 HTTPS。脚本不修改云平台安全组，需要你放行 80/443；后端仅绑定 127.0.0.1，不开放 3000。已启用的 UFW/firewalld 会增加网站端口规则；脚本不启用原来关闭的防火墙、不改 SSH 规则。自定义 firewalld 区域可用 `--firewall-zone public` 指定；不希望改规则时使用 `--no-firewall`。

## 4. 脚本自动完成什么

- 校验操作系统、架构、域名、端口和受管安装路径。
- 安装稳定仓库依赖及独立的 Node 24 运行环境，不替换其他网站的全局 Node。
- 使用独立构建用户运行 `npm ci` 和 Linux 构建，以独立服务用户运行应用。
- 配置 Nginx、systemd 开机启动、每分钟采集检查；所有业务计划仍按北京时间计算。
- Rocky 保留 SELinux 启用状态，设置 Node 可执行文件标签和 Nginx 反向代理所需网络布尔值，不使用 `setenforce 0`。
- 生成首次初始化凭证和后台密钥；更新时保留已有密钥和账号密码。
- 更新前停止本项目的采集和服务，使用 SQLite 在线备份 API 备份数据库，保存配置和旧版本。
- 检查 Nginx 配置及应用 HTTP 启动状态，通过后启动对应定时器。

首次成功部署默认启用定时器。更新默认保留它原来的启用/暂停状态；可显式使用 `--enable-timer` 或 `--disable-timer`。在网站中暂停采集计划后，定时器仍可能检查一次，但不会绕过网站的暂停设置。

## 5. 首次登录

访问部署后的网址创建主管理员。初始化凭证只存在受保护的环境文件，不会出现在安装日志。你可以在服务器本机读取这一项：

```sh
sudo sed -n 's/^BOOTSTRAP_ADMIN_TOKEN=//p' /etc/period-observer.env
```

输出值可能带双引号，输入网页时使用引号里面的值。创建主管理员后可从环境文件删除该项并重启服务。后台专用密钥不要填入网页，也不要上传 GitHub。

## 6. 更新、运行包与文件位置

在 Git 源码目录中执行更新脚本，使用首次部署的相同域名、证书和端口参数：

```sh
sudo bash deploy/update-linux.sh --domain observer.example.com \
  --tls-cert /path/to/fullchain.pem --tls-key /path/to/privkey.pem
```

更新脚本检查本地修改并从 `origin/main` 快进更新，拒绝覆盖本地改动或自动合并冲突；同一时间只运行一个更新任务。通过安装检查后，在 `/opt/period-observer/.deployed-commit` 记录实际部署的 Git 版本。后续新增功能推送到 GitHub 后，用同一命令更新服务器。

早期版本没有此脚本时，先执行 `git pull --ff-only`。也可以继续重新执行原来的 Ubuntu / Rocky 安装命令。Ubuntu 安装依赖时只报告其他服务的待重启状态，避免自动重启主机上的无关服务。

脚本保留 `/var/lib/period-observer`，不清空数据库或重新生成已有密钥。版本位于 `/opt/period-observer/releases/`，`current` 链接指向当前版本。旧版本、备份不会自动删除，请按服务器容量和保留周期自行管理。

也可以在同架构的构建机上执行：

```sh
npm ci
npm run build:linux
tar -czf period-observer-linux.tar.gz -C dist-linux .
```

把运行包传到服务器，使用项目源码中的脚本，或包内 `deploy/` 下的脚本：

```sh
sudo bash deploy/rocky-9.sh --bundle /path/to/period-observer-linux.tar.gz \
  --domain observer.example.com \
  --tls-cert /path/to/fullchain.pem --tls-key /path/to/privkey.pem
```

`--bundle` 不运行 npm 构建，但仍安装基础系统依赖和 Node。压缩包路径穿越、外部链接、特殊设备文件会被拒绝。需要固定运行环境时加 `--node-version v24.X.Y`，须为已发布且不低于 24.19 的官方版本。

## 7. 失败处理和旧手工安装迁移

构建失败时不会切换正在运行的应用。服务/配置切换后失败，脚本会尝试恢复旧代码和配置；已有数据库不会被自动覆盖回退。安装的软件包、SELinux 设置和已添加的防火墙规则不会自动卸载或撤销。

数据库与配置备份在 `/var/backups/period-observer/时间戳/`。如果数据库迁移与旧代码不兼容，先停止服务与定时器，确认备份点并另存失败后的数据库，再人工恢复；避免自动覆盖更新期间的数据。首次安装失败时保留现场，修复原因后可重试。

早期手工部署使用 `/opt/period-observer/server.js`，本脚本使用 `current/` 版本目录。检测到旧的手工目录、自定义服务或同名非受管 Nginx 配置时会停止。请先导出网站迁移备份并保留旧安装副本，在独立目录或新服务器安装，再按 [Linux 部署说明](README.md) 导入；不要直接删除旧数据库来让检查通过。

```sh
sudo systemctl status period-observer.service
sudo systemctl list-timers period-observer-tick.timer
sudo journalctl -u period-observer.service -n 100 --no-pager
sudo journalctl -u period-observer-tick.service -n 100 --no-pager
sudo nginx -t
```

## 验证与参考

本次已进行 Bash 语法、两个发行版的无副作用预演，以及辅助程序测试（密钥保留、SQLite WAL 备份、配置生成、压缩包拒绝危险路径）。当前开发机为 Windows，未在真实 Ubuntu/Rocky 服务器执行软件安装、SELinux 或 systemd，因此目标服务器仍需按上述状态命令验收。

官方参考：[Ubuntu Nginx](https://ubuntu.com/server/docs/how-to/web-services/configure-nginx/)、[Rocky Nginx 与防火墙](https://docs.rockylinux.org/guides/web/nginx-mainline/)、[Rocky 发行表](https://docs.rockylinux.org/latest/releases/)、[Node 24 官方下载](https://nodejs.org/dist/latest-v24.x/)。
