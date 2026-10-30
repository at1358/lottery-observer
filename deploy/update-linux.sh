#!/usr/bin/env bash
# Fetch the project's main branch and deploy it using the existing installer.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
 cat <<'HELP'
用法：sudo bash deploy/update-linux.sh [原安装命令中的域名、证书和端口参数]
先检查源码没有本地修改，再从 origin/main 快进更新，执行对应系统的部署脚本。
示例：sudo bash deploy/update-linux.sh --domain observer.example.com \
  --tls-cert /path/to/fullchain.pem --tls-key /path/to/privkey.pem
更新保留数据库、账号、密钥和定时器状态；安装失败时不记录为已部署版本。
HELP
 exit 0
fi
((EUID==0)) || { printf '%s\n' '请用 sudo 或 root 执行' >&2; exit 1; }
exec 9>/run/lock/period-observer-update.lock
flock -n 9 || { printf '%s\n' '已有更新任务正在运行，请稍后再试' >&2; exit 1; }
[[ -r /etc/os-release ]] || { printf '%s\n' '无法读取操作系统信息' >&2; exit 1; }
# /etc/os-release is maintained by the operating system.
. /etc/os-release
case "$ID:${VERSION_ID:-}" in
 ubuntu:24.04) INSTALLER=ubuntu-24.04.sh;;
 rocky:9|rocky:9.*) INSTALLER=rocky-9.sh;;
 *) printf '%s\n' '仅支持 Ubuntu 24.04 和 Rocky Linux 9' >&2; exit 1;;
esac
cd -- "$SOURCE_DIR"
[[ "$(git rev-parse --show-toplevel)" == "$SOURCE_DIR" ]] || { printf '%s\n' '请从项目 Git 仓库运行更新脚本' >&2; exit 1; }
[[ "$(git branch --show-current)" == main ]] || { printf '%s\n' '源码需要位于 main 分支' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { printf '%s\n' '源码存在本地修改，请先处理；本次不会覆盖' >&2; exit 1; }
git fetch --no-tags origin main
git merge --ff-only origin/main
REVISION="$(git rev-parse HEAD)"
bash "$SOURCE_DIR/deploy/$INSTALLER" "$@"
printf '%s\n' "$REVISION" > /opt/period-observer/.deployed-commit.new
mv -f -- /opt/period-observer/.deployed-commit.new /opt/period-observer/.deployed-commit
printf '已部署 Git 版本：%s\n' "$REVISION"
