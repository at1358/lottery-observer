#!/usr/bin/env bash
# Shared installer. Use ubuntu-24.04.sh or rocky-9.sh as the public entry point.
set -Eeuo pipefail
export LC_ALL=C
umask 027
PLATFORM="${1:-}"; shift || true
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SUPPORT="$SCRIPT_DIR/install_support.py"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DOMAIN='' PORT=3000 CERT='' KEY='' BUNDLE='' NODE_VERSION='' HTTP_ONLY=0 DRY_RUN=0
MANAGE_FIREWALL=1 FIREWALL_ZONE='' TIMER_OPTION='preserve'
APP_ROOT=/opt/period-observer
NODE_ROOT=/opt/period-observer-node
DATA_DIR=/var/lib/period-observer
ENV_FILE=/etc/period-observer.env
SERVICE_USER=period-observer
BUILD_USER=period-observer-build
NGINX_FILE=/etc/nginx/conf.d/period-observer.conf
WORK='' BACKUP='' OLD_RELEASE='' OLD_NODE='' ACTIVATED=0 CONFIG_CHANGED=0
WAS_WEB=0 WAS_TIMER=0 WAS_TIMER_ENABLED=0 OLD_INSTALL=0

die(){ printf '错误：%s\n' "$*" >&2; exit 1; }
log(){ printf '[期数采集台] %s\n' "$*"; }
usage(){ cat <<'HELP'
用法：sudo bash deploy/ubuntu-24.04.sh [参数]
      sudo bash deploy/rocky-9.sh [参数]
  --domain HOST              域名或 IPv4 地址，必填
  --tls-cert /absolute/path  HTTPS 完整证书链
  --tls-key /absolute/path   HTTPS 私钥（无密码）
  --http-only                明确选择 HTTP 测试模式，生产建议 HTTPS
  --port NUMBER              后端本机端口，默认 3000（1024–65535）
  --source /path/to/project  从源码安装，默认当前脚本所在项目
  --bundle /path/app.tar.gz  使用 npm run build:linux 生成的运行包
  --node-version v24.X.Y     固定 Node 版本，默认官方最新 24 LTS 补丁版
  --no-firewall              不修改现有防火墙规则
  --firewall-zone NAME       Rocky firewalld 区域，默认使用其默认区域
  --enable-timer             启用每分钟采集检查；更新默认保留原状态
  --disable-timer            安装后不启用定时器
  --dry-run                  仅输出计划，不安装、不写系统文件
  --help                     查看帮助
HELP
}
value(){ [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "参数 $1 缺少值"; }
while (($#)); do
 case "$1" in
  --domain) value "$@"; DOMAIN="$2"; shift 2;;
  --port) value "$@"; PORT="$2"; shift 2;;
  --tls-cert) value "$@"; CERT="$2"; shift 2;;
  --tls-key) value "$@"; KEY="$2"; shift 2;;
  --source) value "$@"; SOURCE_DIR="$2"; shift 2;;
  --bundle) value "$@"; BUNDLE="$2"; shift 2;;
  --node-version) value "$@"; NODE_VERSION="$2"; shift 2;;
  --http-only) HTTP_ONLY=1; shift;;
  --dry-run) DRY_RUN=1; shift;;
  --no-firewall) MANAGE_FIREWALL=0; shift;;
  --firewall-zone) value "$@"; FIREWALL_ZONE="$2"; shift 2;;
  --enable-timer) TIMER_OPTION=enable; shift;;
  --disable-timer) TIMER_OPTION=disable; shift;;
  --help|-h) usage; exit 0;;
  *) die "未知参数：$1";;
 esac
done
[[ "$PLATFORM" == ubuntu-24.04 || "$PLATFORM" == rocky-9 ]] || die '请使用发行版入口脚本'
DOMAIN="${DOMAIN,,}"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && ${#DOMAIN} -le 253 && "$DOMAIN" != *..* ]] || die '请填写有效域名或 IPv4 地址'
IFS='.' read -r -a labels <<< "$DOMAIN"
for label in "${labels[@]}"; do [[ ${#label} -le 63 && "$label" != -* && "$label" != *- ]] || die '域名标签无效'; done
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] && ((10#$PORT>=1024 && 10#$PORT<=65535)) || die '后端端口应为 1024–65535'
PORT=$((10#$PORT))
[[ -z "$NODE_VERSION" || "$NODE_VERSION" =~ ^v24\.[0-9]+\.[0-9]+$ ]] || die 'Node 版本必须是 v24.X.Y'
if [[ -n "$NODE_VERSION" ]]; then IFS='.' read -r _ minor _ <<< "$NODE_VERSION"; ((10#$minor>=19)) || die 'Node 至少需要 v24.19.0'; fi
[[ -z "$FIREWALL_ZONE" || "$FIREWALL_ZONE" =~ ^[A-Za-z0-9_-]+$ ]] || die '防火墙区域名称无效'
if ((HTTP_ONLY)); then [[ -z "$CERT" && -z "$KEY" ]] || die '--http-only 不能与证书参数同时使用'
else
 [[ "$CERT" =~ ^/[A-Za-z0-9_./-]+$ && "$KEY" =~ ^/[A-Za-z0-9_./-]+$ ]] || die 'HTTPS 需要 --tls-cert 和 --tls-key 绝对路径，或明确指定 --http-only'
fi
OS_FILE=/etc/os-release
if ((DRY_RUN)) && [[ -n "${OBSERVER_DEPLOY_OS_RELEASE:-}" ]]; then OS_FILE="$OBSERVER_DEPLOY_OS_RELEASE"; fi
[[ -r "$OS_FILE" ]] || die '无法读取操作系统信息'
OS_ID="$(sed -n 's/^ID=//p' "$OS_FILE" | tr -d '\"\047')"
OS_VERSION="$(sed -n 's/^VERSION_ID=//p' "$OS_FILE" | tr -d '\"\047')"
case "$PLATFORM" in
 ubuntu-24.04) [[ "$OS_ID" == ubuntu && "$OS_VERSION" == 24.04 ]] || die '此脚本仅支持 Ubuntu 24.04 LTS';;
 rocky-9) [[ "$OS_ID" == rocky && "$OS_VERSION" == 9* && "${OS_VERSION%%.*}" == 9 ]] || die '此脚本仅支持 Rocky Linux 9 系列';;
esac
case "$(uname -m)" in x86_64|amd64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; *) die '仅支持 x86_64 和 ARM64';; esac
if ((DRY_RUN)); then
 log "仅预览：$OS_ID $OS_VERSION / $ARCH"
 log "Node：${NODE_VERSION:-官方 latest-v24.x}，校验 SHA256；系统软件使用发行版稳定仓库"
 [[ "$PLATFORM" == ubuntu-24.04 ]] && log '依赖：apt-get / nginx / python3 / build-essential' || log '依赖：dnf / nginx / python3 / gcc / SELinux policy tools'
 log "来源：${BUNDLE:-$SOURCE_DIR}；目标：$APP_ROOT/current；数据库：$DATA_DIR"
 log "访问：$([[ "$HTTP_ONLY" == 1 ]] && printf http || printf https)://$DOMAIN；后端仅监听 127.0.0.1:$PORT"
 log "定时器：$TIMER_OPTION；防火墙自动处理：$MANAGE_FIREWALL"
 log '现有密钥保留；更新前备份 SQLite；失败回退代码和配置，数据库备份留待人工确认恢复'
 exit 0
fi
((EUID==0)) || die '请用 sudo 或 root 执行'
[[ "$(uname -s)" == Linux ]] || die '实际安装必须在 Linux 上执行'
[[ -d /run/systemd/system ]] || die '需要使用 systemd 的服务器；不支持无 systemd 的容器'
if [[ -L "$APP_ROOT" || -L "$DATA_DIR" || -L "$NODE_ROOT" || -L "$ENV_FILE" || -L "$NGINX_FILE" ]]; then die '系统安装路径不能是外部符号链接'; fi
[[ ! -e "$NODE_ROOT/current" || -L "$NODE_ROOT/current" ]] || die 'Node current 路径必须是本脚本管理的符号链接'
if [[ -L "$NODE_ROOT/current" ]]; then
 OLD_NODE="$(readlink -f "$NODE_ROOT/current")"
 [[ "$OLD_NODE" == "$NODE_ROOT/"* ]] || die '原 Node 路径超出受管目录'
fi
if [[ -e "$APP_ROOT/current" ]]; then
 [[ -L "$APP_ROOT/current" && -f "$APP_ROOT/.installer-managed" ]] || die '发现非本脚本管理的旧安装，请先按部署说明迁移'
 OLD_RELEASE="$(readlink -f "$APP_ROOT/current")"
 [[ "$OLD_RELEASE" == "$APP_ROOT/releases/"* ]] || die '原版本路径超出受管目录'
 OLD_INSTALL=1
elif [[ -e "$APP_ROOT" && ! -f "$APP_ROOT/.installer-managed" ]] && [[ -n "$(ls -A "$APP_ROOT")" ]]; then die '安装目录非空且不受本脚本管理，请先迁移'; fi
if [[ -e "$NGINX_FILE" ]] && ! grep -q '^# Managed by lottery-observer' "$NGINX_FILE"; then die '已有同名 Nginx 配置不是本脚本生成，拒绝覆盖'; fi
for unit in period-observer.service period-observer-tick.service period-observer-tick.timer; do
 [[ ! -L "/etc/systemd/system/$unit" ]] || die "服务 $unit 不能是外部符号链接"
 if [[ -e "/etc/systemd/system/$unit" ]] && ! grep -q '^# Managed by lottery-observer' "/etc/systemd/system/$unit"; then die "发现旧版或自定义服务 $unit，请按说明先迁移"; fi
done
log '安装系统依赖（不进行系统大版本升级）'
if [[ "$PLATFORM" == ubuntu-24.04 ]]; then
 apt-get update
 DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl xz-utils nginx openssl tar python3 git build-essential util-linux
else
 dnf install -y ca-certificates curl xz nginx openssl tar python3 git gcc gcc-c++ make util-linux policycoreutils-python-utils
fi
if ((!HTTP_ONLY)); then
 [[ -r "$CERT" && -r "$KEY" ]] || die '证书或私钥文件不可读'
 openssl x509 -in "$CERT" -noout -checkend 0 >/dev/null || die '证书无效或已过期'
 if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then openssl x509 -in "$CERT" -noout -checkip "$DOMAIN" >/dev/null || die '证书不包含此 IP';
 else openssl x509 -in "$CERT" -noout -checkhost "$DOMAIN" >/dev/null || die '证书不包含此域名'; fi
 cert_pub="$(openssl x509 -in "$CERT" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum)"
 key_pub="$(openssl pkey -in "$KEY" -passin pass: -pubout -outform DER | sha256sum)"
 [[ "$cert_pub" == "$key_pub" ]] || die '证书和私钥不匹配'
fi
if ss -H -ltn "sport = :$PORT" | grep -q . && ! systemctl is-active --quiet period-observer.service; then die "端口 $PORT 已被其他服务占用"; fi
WORK="$(mktemp -d /var/tmp/period-observer-install.XXXXXXXX)"
cleanup(){ if [[ -n "$WORK" && "$WORK" == /var/tmp/period-observer-install.* && -d "$WORK" && ! -L "$WORK" ]]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT
ROLLBACK_FILES=("$ENV_FILE" "$NGINX_FILE" /etc/systemd/system/period-observer.service /etc/systemd/system/period-observer-tick.service /etc/systemd/system/period-observer-tick.timer)
if ((!HTTP_ONLY)); then
 if [[ "$PLATFORM" == rocky-9 ]]; then CERT_DEST=/etc/pki/tls/certs/period-observer-fullchain.pem; KEY_DEST=/etc/pki/tls/private/period-observer-key.pem;
 else CERT_DEST=/etc/ssl/certs/period-observer-fullchain.pem; KEY_DEST=/etc/ssl/private/period-observer-key.pem; fi
 [[ ! -L "$CERT_DEST" && ! -L "$KEY_DEST" ]] || die '受管证书位置已存在外部符号链接'
 ROLLBACK_FILES+=("$CERT_DEST" "$KEY_DEST")
fi
rollback(){
 local result=$?
 trap - ERR
 log '安装未完成，正在恢复原代码与配置' >&2
 if ((ACTIVATED)); then
  systemctl stop period-observer-tick.timer period-observer-tick.service period-observer.service || true
  if [[ -n "$OLD_RELEASE" ]]; then ln -sfn -- "$OLD_RELEASE" "$APP_ROOT/current"; else rm -f -- "$APP_ROOT/current"; fi
 fi
 if [[ -n "$OLD_NODE" && "$OLD_NODE" == "$NODE_ROOT/"* ]]; then ln -sfn -- "$OLD_NODE" "$NODE_ROOT/current"; fi
 if ((CONFIG_CHANGED)); then
  local file
  for file in "${ROLLBACK_FILES[@]}"; do
   if [[ -f "$BACKUP/config$file" ]]; then cp -p -- "$BACKUP/config$file" "$file";
   elif [[ -f "$BACKUP/new-files" ]] && grep -Fxq -- "$file" "$BACKUP/new-files"; then rm -f -- "$file"; fi
  done
  systemctl daemon-reload || true
  if ((WAS_WEB)); then systemctl start period-observer.service || true; fi
  if ((WAS_TIMER)); then systemctl start period-observer-tick.timer || true; fi
  if nginx -t; then systemctl reload nginx || true; fi
 fi
 [[ -z "$BACKUP" ]] || log "备份保留：$BACKUP。数据库不会自动覆盖回退，请参照文档确认后恢复。" >&2
 exit "$result"
}
trap rollback ERR
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --user-group --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
id "$BUILD_USER" >/dev/null 2>&1 || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$BUILD_USER"
install -d -m 0755 "$APP_ROOT" "$APP_ROOT/releases" "$NODE_ROOT"
touch "$APP_ROOT/.installer-managed"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$DATA_DIR"
[[ ! -L "$NODE_ROOT/current" ]] || OLD_NODE="$(readlink -f "$NODE_ROOT/current")"
log '从 Node.js 官方下载并验证运行环境'
NODE_BASE="https://nodejs.org/dist/${NODE_VERSION:-latest-v24.x}"
curl --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 300 --fail --location --retry 3 "$NODE_BASE/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
read -r NODE_SHA NODE_ARCHIVE < <(python3 "$SUPPORT" node-artifact "$WORK/SHASUMS256.txt" "$ARCH")
[[ -n "$NODE_SHA" && -n "$NODE_ARCHIVE" ]] || die '无法解析官方 Node 版本'
curl --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 300 --fail --location --retry 3 "$NODE_BASE/$NODE_ARCHIVE" -o "$WORK/$NODE_ARCHIVE"
printf '%s  %s\n' "$NODE_SHA" "$WORK/$NODE_ARCHIVE" | sha256sum --check --status
tar -xJf "$WORK/$NODE_ARCHIVE" -C "$NODE_ROOT" --no-same-owner
NODE_DIR="$NODE_ROOT/${NODE_ARCHIVE%.tar.xz}"
ln -sfn -- "$NODE_DIR" "$NODE_ROOT/current"
NODE="$NODE_ROOT/current/bin/node"
export PATH="$NODE_ROOT/current/bin:$PATH"
"$NODE" --version
if [[ "$PLATFORM" == rocky-9 ]] && command -v getenforce >/dev/null && [[ "$(getenforce)" != Disabled ]]; then
 semanage fcontext -a -t bin_t '/opt/period-observer-node/.*/bin/node' 2>/dev/null || semanage fcontext -m -t bin_t '/opt/period-observer-node/.*/bin/node'
 restorecon -R "$NODE_ROOT"
 setsebool -P httpd_can_network_connect 1
fi
install -d -o "$BUILD_USER" -g "$BUILD_USER" -m 0700 "$WORK/build" "$WORK/home"
chmod 0755 "$WORK"
if [[ -n "$BUNDLE" ]]; then
 BUNDLE="$(realpath "$BUNDLE")"
 [[ -f "$BUNDLE" ]] || die '运行包不存在'
 install -o "$BUILD_USER" -g "$BUILD_USER" -m 0600 "$BUNDLE" "$WORK/application.tar"
 install -m 0644 "$SUPPORT" "$WORK/install_support.py"
 runuser -u "$BUILD_USER" -- python3 "$WORK/install_support.py" extract "$WORK/application.tar" "$WORK/build"
 BUILT="$WORK/build"
else
 SOURCE_DIR="$(realpath "$SOURCE_DIR")"
 [[ -f "$SOURCE_DIR/package-lock.json" && -f "$SOURCE_DIR/scripts/build-linux.mjs" ]] || die '不是有效的项目源码目录'
 log '以独立构建用户安装锁定依赖并生成 Linux 版本'
 tar -C "$SOURCE_DIR" --exclude='./.git' --exclude='./node_modules' --exclude='./dist' --exclude='./dist-linux' --exclude='./data' --exclude='./outputs' --exclude='./.env*' --exclude='./.dev.vars*' --exclude='./.wrangler' --exclude='./.sites-runtime' --exclude='./.codex' --exclude='./.agents' -cf - . |
  runuser -u "$BUILD_USER" -- tar -C "$WORK/build" --no-same-owner -xf -
 runuser -u "$BUILD_USER" -- env HOME="$WORK/home" PATH="$PATH" bash -Eeuo pipefail -c 'cd -- "$1"; npm ci --no-audit --no-fund; npm run build:linux' bash "$WORK/build"
 BUILT="$WORK/build/dist-linux"
fi
[[ -f "$BUILT/server.js" && -f "$BUILT/tick.mjs" && -d "$BUILT/drizzle" && -d "$BUILT/node_modules" ]] || die '运行包缺少必要文件'
VERSION="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RELEASE="$APP_ROOT/releases/$VERSION"
install -d -m 0755 "$RELEASE"
cp -a -- "$BUILT/." "$RELEASE/"
chown -R root:root "$RELEASE"
chmod -R go-w "$RELEASE"
BACKUP="/var/backups/period-observer/$VERSION"
install -d -m 0700 "$BACKUP" "$BACKUP/config"
for file in "${ROLLBACK_FILES[@]}"; do
 if [[ -f "$file" ]]; then install -d -m 0700 "$BACKUP/config$(dirname "$file")"; cp -p -- "$file" "$BACKUP/config$file";
 else printf '%s\n' "$file" >> "$BACKUP/new-files"; fi
done
systemctl is-active --quiet period-observer.service && WAS_WEB=1 || true
systemctl is-active --quiet period-observer-tick.timer && WAS_TIMER=1 || true
systemctl is-enabled --quiet period-observer-tick.timer && WAS_TIMER_ENABLED=1 || true
systemctl stop period-observer-tick.timer period-observer-tick.service period-observer.service 2>/dev/null || true
CONFIG_CHANGED=1
python3 "$SUPPORT" backup "$DATA_DIR/observer.sqlite" "$BACKUP/observer.sqlite"
python3 "$SUPPORT" environment --existing "$ENV_FILE" --domain "$DOMAIN" --port "$PORT" --output "$WORK/environment"
install -o root -g "$SERVICE_USER" -m 0640 "$WORK/environment" "$ENV_FILE"
if ((!HTTP_ONLY)); then
 [[ -d "$(dirname "$CERT_DEST")" ]] || install -d -m 0755 "$(dirname "$CERT_DEST")"
 [[ -d "$(dirname "$KEY_DEST")" ]] || install -d -m 0700 "$(dirname "$KEY_DEST")"
 install -o root -g root -m 0644 "$CERT" "$CERT_DEST"
 install -o root -g root -m 0600 "$KEY" "$KEY_DEST"
 CERT="$CERT_DEST"; KEY="$KEY_DEST"
 if [[ "$PLATFORM" == rocky-9 ]] && command -v restorecon >/dev/null; then restorecon "$CERT" "$KEY"; fi
fi
python3 "$SUPPORT" templates --domain "$DOMAIN" --port "$PORT" --cert "${CERT_DEST:-}" --key "${KEY_DEST:-}" --output "$WORK/templates"
for unit in period-observer.service period-observer-tick.service period-observer-tick.timer; do
 install -o root -g root -m 0644 "$WORK/templates/$unit" "/etc/systemd/system/$unit"
done
install -o root -g root -m 0644 "$WORK/templates/period-observer.conf" "$NGINX_FILE"
nginx -t
ACTIVATED=1
ln -sfn -- "$RELEASE" "$APP_ROOT/current"
touch "$APP_ROOT/.installer-managed"
systemctl daemon-reload
systemctl enable period-observer.service
systemctl restart period-observer.service
READY=0
for ((attempt=0;attempt<30;attempt++)); do
 if curl --silent --fail --max-time 5 "http://127.0.0.1:$PORT/" -o /dev/null; then READY=1; break; fi
 sleep 2
done
((READY)) || { log '启动检查失败，请查看 journalctl -u period-observer.service' >&2; false; }
systemctl enable --now nginx
systemctl reload nginx
if [[ "$TIMER_OPTION" == enable || ( "$TIMER_OPTION" == preserve && "$OLD_INSTALL" == 0 ) || ( "$TIMER_OPTION" == preserve && "$WAS_TIMER_ENABLED" == 1 ) ]]; then systemctl enable period-observer-tick.timer; fi
if [[ "$TIMER_OPTION" == enable || ( "$TIMER_OPTION" == preserve && "$OLD_INSTALL" == 0 ) || ( "$TIMER_OPTION" == preserve && "$WAS_TIMER" == 1 ) ]]; then systemctl start period-observer-tick.timer; fi
if [[ "$TIMER_OPTION" == disable ]]; then systemctl disable --now period-observer-tick.timer; fi
if ((MANAGE_FIREWALL)); then
 if [[ "$PLATFORM" == ubuntu-24.04 ]] && command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then ufw allow 80/tcp; ((HTTP_ONLY)) || ufw allow 443/tcp;
 elif [[ "$PLATFORM" == rocky-9 ]] && systemctl is-active --quiet firewalld; then
  zone="${FIREWALL_ZONE:-$(firewall-cmd --get-default-zone)}"
  firewall-cmd --permanent --zone="$zone" --add-service=http
  ((HTTP_ONLY)) || firewall-cmd --permanent --zone="$zone" --add-service=https
  firewall-cmd --reload
 fi
fi
trap - ERR
log "部署完成：$([[ "$HTTP_ONLY" == 1 ]] && printf http || printf https)://$DOMAIN"
log "当前版本：$RELEASE；备份：$BACKUP"
log '初始化凭证保存在 /etc/period-observer.env，未写入安装日志。已有账号继续使用原密码。'
log '云服务器安全组仍需放行访问端口；后端端口不会对外开放。'
