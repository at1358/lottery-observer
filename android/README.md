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

以后发布更新：保留包名、保留同一个签名，提高 `versionCode` 并调整 `versionName`，通过检查后分发新 APK。业务网页更新通常不需要重新发布 APK。

## 验证

- `SitePolicyTest` 验证同源地址、非默认端口、欺骗域名、账号信息 URL、非网页协议、Blob 来源和文件名处理。
- `lintRelease` 检查 API 兼容性、权限和资源；`apksigner verify` 检查安装签名。
- 实机验收清单：首次登录、重启后的登录状态、会话过期、系统返回、网页菜单、键盘遮挡、旋转屏幕、无网重试、资料页 CSV 导出、迁移备份 JSON 下载、站外链接、同签名 APK 覆盖升级。
- 未接入手机时，构建和自动检查不等同于全部实体机验收。

实现参考：[WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient)、[限制消息来源](https://developer.android.com/reference/androidx/webkit/WebViewCompat)、[网络安全配置](https://developer.android.com/privacy-and-security/security-config)。
