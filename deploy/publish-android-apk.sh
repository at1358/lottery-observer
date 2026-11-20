#!/usr/bin/env bash
# Publish only an already signed, checksum-verified APK. Never copy a keystore.
set -Eeuo pipefail
[[ $EUID == 0 && ( $# == 3 || $# == 4 ) ]] || { echo '用法：sudo bash deploy/publish-android-apk.sh signed.apk sha256 1.1.0 2' >&2; exit 1; }
python3 - "$1" "$2" "$3" "${4:-1}" <<'PY'
import hashlib,json,os,re,shutil,sys,tempfile,zipfile
from pathlib import Path
source=Path(sys.argv[1]).resolve();digest=sys.argv[2].lower();version=sys.argv[3];code=int(sys.argv[4])
assert 1<=code<=2147483647,'Invalid version code'
assert re.fullmatch(r'[0-9a-f]{64}',digest),'Invalid checksum'
assert re.fullmatch(r'\d+\.\d+\.\d+',version),'Invalid version'
assert source.is_file() and 4096<source.stat().st_size<100*1024*1024,'Invalid APK file'
assert hashlib.sha256(source.read_bytes()).hexdigest()==digest,'APK checksum differs'
with zipfile.ZipFile(source) as apk:
 assert 'AndroidManifest.xml' in apk.namelist() and 'classes.dex' in apk.namelist(),'Not an Android APK'
root=Path('/var/www/period-observer-app');root.mkdir(parents=True,exist_ok=True);root.chmod(0o755)
assert not root.is_symlink(),'Download root must be a real directory'
latest=root/'latest.json'
if latest.exists():
 old=json.loads(latest.read_text(encoding='utf-8'));assert old['versionCode']<=code,'Cannot publish an older release'
 if old['versionCode']==code:assert old['sha256']==digest and old['versionName']==version,'Version code already published; increase app version'
name=f'PeriodObserver-{version}.apk';target=root/name
if target.exists():assert hashlib.sha256(target.read_bytes()).hexdigest()==digest,'Existing version differs; increase the app version'
fd,temp=tempfile.mkstemp(prefix='.android-',dir=root);os.close(fd)
try:
 shutil.copyfile(source,temp);os.chmod(temp,0o644);os.replace(temp,target)
finally:
 if os.path.exists(temp):os.unlink(temp)
(root/(name+'.sha256')).write_text(digest+'  '+name+'\n');(root/(name+'.sha256')).chmod(0o644)
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>期数采集台 · 安卓应用</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f7f5;color:#163b2e;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}main{max-width:580px;margin:8vh auto;padding:32px 24px;background:white;border-radius:20px;box-shadow:0 16px 70px #183d2c12}h1{font-size:30px;margin:8px 0}p{color:#61796d}.icon{width:64px;height:64px;background:#123a30;color:white;border-radius:18px;display:grid;place-items:center;font-size:34px}a{color:#167b64}.download{display:block;text-align:center;background:#167b64;color:white;text-decoration:none;padding:14px;border-radius:12px;font-weight:600;margin:24px 0}small{display:block;color:#7e8d84;font-size:13px}.details{border-top:1px solid #e4ece7;margin-top:24px;padding-top:20px}code{overflow-wrap:anywhere;font-size:12px}@media(max-width:600px){main{margin:20px 12px}}</style><main><div class="icon">期</div><small>期数采集台 · Android</small><h1>手机打开，即刻连接</h1><p>直接使用现有服务器上的功能，安装后使用你的网站账号密码登录。</p><a class="download" href="__APK__" download>下载安卓安装包 · v__VERSION__</a><small>适用 Android 8.0 及以上。下载后按手机系统提示安装。</small><div class="details"><strong>网页功能，随站点更新</strong><p>采集资料、自建资料、组合计算、统计排行及系统设置，继续使用原有账号权限。关闭应用不会停止服务器定时任务。</p><p>支持返回、刷新、网络重试和导出保存。当前服务器连接为 HTTP，账号密码传输未加密。</p><p><a href="/m">打开手机网页版</a> · <a href="__APK__.sha256">查看安装包校验值</a></p></div></main></html>'''
(root/'index.html').write_text(page.replace('__APK__',name).replace('__VERSION__',version));(root/'index.html').chmod(0o644)
manifest={'versionCode':code,'versionName':version,'packageName':'com.aifx.observer','url':'http://8.134.37.202/app-downloads/'+name,'sha256':digest,'size':source.stat().st_size,'notes':'新增90天保持登录、可选指纹解锁、服务器更新检查，升级蓝白主题图标。'}
fd,temp=tempfile.mkstemp(prefix='.release-',dir=root);os.close(fd)
try:
 Path(temp).write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8');os.chmod(temp,0o644);os.replace(temp,latest)
finally:
 if os.path.exists(temp):os.unlink(temp)
print('APK_PUBLISHED',name,digest)
PY
python3 - <<'PY'
from pathlib import Path
import datetime,os,subprocess,tempfile
config=Path('/etc/nginx/conf.d/period-observer.conf');original=config.read_bytes();text=original.decode()
if 'location ^~ /app-downloads/' in text:print('DOWNLOAD_LOCATION_PRESENT');raise SystemExit(0)
needle='    location / {'
assert text.count(needle)==1,'Expected one existing application location'
block='''    location ^~ /app-downloads/ {
        alias /var/www/period-observer-app/;
        index index.html;
        autoindex off;
        types { application/vnd.android.package-archive apk; text/html html; text/plain sha256; }
        default_type application/octet-stream;
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "no-cache" always;
        limit_except GET HEAD { deny all; }
    }
'''
backup=config.with_name(config.name+'.android-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.write_bytes(original);backup.chmod(0o600)
try:
 config.write_text(text.replace(needle,block+needle));subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
 config.write_bytes(original);subprocess.run(['nginx','-t'],check=False);raise
print('DOWNLOAD_LOCATION_ENABLED')
PY
python3 - "$2" "$3" <<'PY'
import hashlib,re,sys,time,urllib.request
from pathlib import Path
host=re.search(r'server_name\s+([^;\s]+)',Path('/etc/nginx/conf.d/period-observer.conf').read_text()).group(1)
url='http://127.0.0.1/app-downloads/PeriodObserver-'+sys.argv[2]+'.apk'
for attempt in range(30):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Host':host}),timeout=10) as r:
   if hashlib.sha256(r.read()).hexdigest()==sys.argv[1]:print('DOWNLOAD_READY');break
 except Exception:
  pass
 time.sleep(.2)
else:raise RuntimeError('Nginx download readiness check did not pass')
PY
