# 期数采集台 Android 应用

这是现有站点的安卓客户端。安装后打开 `http://8.134.37.202/m`，使用网站已有的账号密码登录，所有权限、资料、计算与企业微信计划仍由服务器管理。关闭 APP 不会停止服务器定时任务。

应用名称：期数采集台。包名：`com.aifx.observer`。首版：1.0.0。支持 Android 8.0 及以上；手机需有可用的 Android System WebView / Chrome 网页组件。

## 使用

- 页面内功能与手机网页版一致；网站更新后重新打开页面即可使用。
- 顶部按钮和系统返回键返回上一页，根页面连续返回两次退出；菜单内可返回首页、刷新、在浏览器打开。
- 正常登录状态遵循网站当前 12 小时有效期，失效或账号被停用、改密时需要重新登录。APP 不预置账号、不保存密码，也不绕过网站权限。
- 网络或服务器异常时显示重试页面；不会因一张图片加载失败遮盖整个页面。
- 站外资料链接经确认后打开手机浏览器，不把站点登录 Cookie 发送给站外域名。
- 支持系统文件选择器上传文件，以及 CSV / JSON 等导出后的“选择保存位置”。不申请相册、相机、定位和全盘文件权限。
- 菜单中的“清除本机登录状态”只清理当前 APP 的 Cookie、页面缓存和本机偏好，不删除服务器数据。需要撤销服务器会话时，使用网站自身的退出登录。

当前站点是 HTTP，账号密码及资料传输未加密。建议后续配置有效 HTTPS 域名；切换地址时须同步调整 `BuildConfig.HOME_URL`、`SitePolicy`、网络安全配置及下载消息允许来源，保持准确匹配。

## 构建

工具版本固定在 Gradle / AGP 配置中；Java 17、Android SDK Platform 36 与 Build Tools 35.0.0。正式构建前通过官方 SDK Manager 安装需要的组件并完成其许可步骤。

Windows PowerShell 7：

```powershell
./android/build-apk.ps1 -JavaHome 'D:/tools/jdk-17' -SdkRoot 'D:/tools/android-sdk' -CreateSigningKey
```

首次运行创建独立正式签名，后续运行不加 `-CreateSigningKey` 并使用原签名。默认签名与随机口令仅存放在已忽略的 `outputs/android-signing/`，目录限制为当前 Windows 用户可访问。**请同时备份签名文件及 signing.json；丢失签名后不能覆盖安装更新，不能把它们提交到 GitHub、上传网站或放进 APK。**

APK 与校验文件输出到 `outputs/android-release/`，构建会运行单元测试、Android Lint 和 APK 签名校验。安装 APK 时按照手机提示允许你选择的文件管理器或浏览器安装此文件，不需要关闭系统其他保护。

Android Studio 或 Linux：设置 `JAVA_HOME` / `ANDROID_HOME`，执行 `./gradlew testDebugUnitTest lintRelease assembleDebug`；正式构建使用 `OBSERVER_ANDROID_STORE_FILE`、`OBSERVER_ANDROID_STORE_PASSWORD`、`OBSERVER_ANDROID_KEY_ALIAS`、`OBSERVER_ANDROID_KEY_PASSWORD` 四个环境变量后执行 `assembleRelease`，缺少正式签名时生成的是未签名包，不能作为正式安装包分发。

仓库的 `Android build and checks` 工作流会执行测试、Lint 并保存未签名 APK 和报告，不接收签名密钥。下载通过检查的构建产物后，可在本机使用 `build-apk.ps1` 的 `-UnsignedApk 'D:/path/app-release-unsigned.apk'` 参数完成对齐、正式签名及验证；签名仍使用原本的本机配置。

## 服务器下载入口

### 1.1.0：保持登录、指纹和更新

- App 登录的有效期为90天，登录状态保存在应用私有的 WebView Cookie 中，不保存账号密码。升级后先登录一次才会取得新的有效期；主动退出、清除登录、改密码、停用账号仍会使会话失效。网页会话仍为12小时。
- 在右上角「更多 → 启用指纹登录」开启。需要手机已经录入指纹或系统生物识别；也可以使用系统锁屏凭证。应用冷启动或离开超过1分钟后验证，短暂切换文件选择器不用反复验证。指纹只解锁已有登录，会话失效时仍需网站密码。忘记指纹可清除本机登录，重新输入网站账号密码。
- 启动后自动检查 `http://8.134.37.202/app-downloads/latest.json`，前台每6小时最多检查一次，也可在更多菜单手动检查。发现新版本后提示下载，通过大小、SHA-256、包名、版本号、原应用签名检查，再请求系统安装。安装必须由用户在系统窗口确认，不做静默安装。
- 图标使用蓝白日历和核验标记，支持自适应圆形/方形桌面裁切。
- 后续发布：提高 `versionCode` 和 `versionName`，使用同一个签名构建，执行 `deploy/publish-android-apk.sh signed.apk SHA256 1.1.0 2`。第四个参数是实际 versionCode，脚本最后原子发布 latest.json，不允许用同一版本号替换不同包或发布更低版本。
- 实机补充验收：后台超过1分钟后的指纹/锁屏验证、取消验证后遮挡内容、退出登录后重新登录、覆盖安装保留登录、新版本提示和系统安装。自动测试不能代替手机指纹硬件与厂商安装器的验收。

把已签名的 APK 和本机生成的 SHA-256 校验值传到服务器后，使用 `deploy/publish-android-apk.sh signed.apk SHA256 1.0.0` 发布。脚本检查文件校验值、安装包结构和版本名，仅把 APK、校验值与下载介绍页放入 `/var/www/period-observer-app/`，不上传签名密钥。

下载页为 `/app-downloads/`。现有服务器通过检查后重载 Nginx 新增这个独立静态路径，原站点代理规则保留；后续 Ubuntu / Rocky 部署模板也保留该路径。下载目录禁止目录列表和写请求。相同版本禁止替换为不同文件；更新时应提高应用版本。

以后发布更新：保留包名、保留同一个签名，提高 `versionCode` 并调整 `versionName`，通过检查后分发新 APK。业务网页更新通常不需要重新发布 APK。

## 验证

- `SitePolicyTest` 验证同源地址、非默认端口、欺骗域名、账号信息 URL、非网页协议、Blob 来源和文件名处理。
- `lintRelease` 检查 API 兼容性、权限和资源；`apksigner verify` 检查安装签名。
- 实机验收清单：首次登录、重启后的登录状态、会话过期、系统返回、网页菜单、键盘遮挡、旋转屏幕、无网重试、资料页 CSV 导出、迁移备份 JSON 下载、站外链接、同签名 APK 覆盖升级。
- 未接入手机时，构建和自动检查不等同于全部实体机验收。

实现参考：[WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient)、[限制消息来源](https://developer.android.com/reference/androidx/webkit/WebViewCompat)、[网络安全配置](https://developer.android.com/privacy-and-security/security-config)。
