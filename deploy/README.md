# Linux 独立部署

Ubuntu 24.04 和 Rocky Linux 9.x 可直接使用 [发行版部署脚本与操作步骤](INSTALL-UBUNTU-ROCKY.md)，包含系统检查、Node 安装、源码构建、Nginx、systemd、每分钟定时器和更新备份。下面保留手工部署及资料迁移方法；自动脚本使用 `/opt/period-observer/current/` 版本目录，手工示例使用平铺目录，操作时选定一种方式。

本系统提供两个构建目标：原 Sites 托管版本保留现有登录外层和发布流程；Linux 独立版本使用系统用户名、密码、SQLite 和系统定时器，不需要 ChatGPT 登录。

## 构建

需要 Node.js 24.19 或更新的 24 LTS 版本，使用内置 SQLite 和 WebSocket。在项目根目录执行：

```sh
npm ci
npm run build:linux
tar -czf period-observer-linux.tar.gz -C dist-linux .
```

仅部署生成的 dist-linux 内容，不要上传本地 outputs、测试数据库、.git 或开发环境文件。无需在 Linux 安装 Cloudflare 或 Codex。

## 安装与启动

1. 创建专用系统用户 period-observer；应用目录 /opt/period-observer 只读，数据目录 /var/lib/period-observer 归该用户写入。
2. 将构建包解压到 /opt/period-observer。复制 environment.example 为 /etc/period-observer.env，文件权限设为 root 可读及服务组可读（0640）。为两个密钥分别生成至少 32 字节随机值，例如 `openssl rand -hex 32`；不要使用示例占位内容。
3. HOST 保持 127.0.0.1。配置真实域名与 Nginx HTTPS，再设置 VINEXT_TRUST_PROXY=1、VINEXT_TRUSTED_HOSTS 为该域名。Nginx 示例只放进已有 HTTPS server 块，证书须自行配置。不要公开 3000 端口。无反向代理的本机测试不设置信任代理变量。
4. 将两个 .service 和 .timer 文件安装到 /etc/systemd/system；如 Node 不在 /usr/bin/node，修改 ExecStart。执行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now period-observer.service
sudo systemctl enable --now period-observer-tick.timer
sudo systemctl status period-observer.service
sudo systemctl list-timers period-observer-tick.timer
```

首次访问显示“创建主管理员账号”，输入环境里配置的初始化凭证后创建自己的账号。没有内置用户名或默认密码。已有用户后初始化入口关闭，建议移除 BOOTSTRAP_ADMIN_TOKEN 并重启。密码修改和管理员重置会使旧登录立即失效；停用和角色变化同样撤销会话。

SQLite 位于 DATA_DIR/observer.sqlite，启用 WAL，启动自动按顺序执行带版本记录的迁移。后续更新只替换应用文件，不覆盖 DATA_DIR。备份运行中的数据库应使用 SQLite 的在线备份工具；直接拷贝文件时先停止服务，并同时考虑 WAL/SHM。

## 从当前网站迁移资料

在当前网站“系统设置 → 迁移备份”导出 JSON，包含原文、版本、文件夹、开奖、回收站及账号的密码摘要，不包含有效登录会话。妥善保管。

先让新服务启动一次完成建库，然后停止服务，将备份复制到服务用户可读的私有位置。确保环境变量已设置：

```sh
sudo systemctl stop period-observer.service
# 以服务用户运行，并设置 DATA_DIR；路径须指向私有备份文件。
DATA_DIR=/var/lib/period-observer node /opt/period-observer/import-backup.mjs /private/path/backup.json
sudo systemctl start period-observer.service
```

导入只接受新建空数据库，拒绝覆盖现有资料。已有账号可用原密码重新登录；未创建账号的备份仍须首次初始化。暂时不要同时运行新旧采集器；确认 Linux 的采集、开奖和日志正常后，再由你停用旧云任务。

## 定时与核验

每分钟定时器通过独立后台密钥调用 /api/tick，不需要浏览器在线。每天 19:00、每 2 小时、每天 21:38 开奖等计划由数据库决定；所有业务时间按 Asia/Shanghai 计算，不依赖 Linux 主机时区。每个批次最多 8 个来源，存在剩余时继续调用。并发批次有数据库租约；重复开奖按年份期数去重。

默认 21:35 截止，失败按来源和期数保存；来源暂停不补记失败。删除的来源暂停，恢复后也保持暂停，需要手动启用。删除原文保留墓碑，防止下一次自动采集恢复已删资料；回收站可主动恢复。

可用 `journalctl -u period-observer.service`、`journalctl -u period-observer-tick.service` 和网站运行日志排查。后台密钥仅在环境文件中保存，不写进浏览器、源码或日志。Node 版本已在本地生产模式验证；未连接你的 Linux 主机，systemd 和 Nginx 示例仍须在目标主机核对。
