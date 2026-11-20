package com.aifx.observer;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Self-hosted release checks. Installation always stays under Android's control. */
final class UpdateController {
    static final int INSTALL_PERMISSION = 1103;
    private final MainActivity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean closed;
    private boolean busy, awaitingPermission, resumeInstall;
    private long lastCheck;
    private File pending;
    private UpdateManifest release;
    UpdateController(MainActivity activity) { this.activity = activity; }

    void check(boolean manual) {
        if (closed || busy || activity.appLocked()) return;
        if (!manual && System.currentTimeMillis() - lastCheck < 6 * 3600000L) return;
        lastCheck = System.currentTimeMillis(); busy = true;
        if (manual) activity.toast("正在检查服务器上的新版本");
        worker.execute(() -> {
            try {
                HttpURLConnection connection = connect(UpdateManifest.URL);
                String json;
                try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] bytes = new byte[4096]; int n, total = 0;
                    while ((n = in.read(bytes)) != -1) { total += n; if (total > 16384) throw new IllegalArgumentException("Large manifest"); out.write(bytes, 0, n); }
                    json = out.toString("UTF-8");
                } finally { connection.disconnect(); }
                UpdateManifest item = new UpdateManifest(json);
                activity.runOnUiThread(() -> {
                    busy = false;
                    if (!usable()) return;
                    if (item.code <= BuildConfig.VERSION_CODE) { if (manual) activity.toast("当前已是最新版本 " + BuildConfig.VERSION_NAME); return; }
                    new AlertDialog.Builder(activity).setTitle("发现新版本 " + item.version)
                        .setMessage(item.notes + "\n\n安装将保留本机登录状态及指纹设置。")
                        .setNegativeButton("稍后", null).setPositiveButton("下载更新", (d, w) -> download(item)).show();
                });
            } catch (Exception error) { fail(manual ? "检查更新失败，请稍后重试；网页功能仍可正常使用" : null); }
        });
    }
    private HttpURLConnection connect(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URI(url).toURL().openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(20000); connection.setReadTimeout(30000);
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("User-Agent", "PeriodObserverAndroid/" + BuildConfig.VERSION_NAME);
        if (connection.getResponseCode() != 200) { connection.disconnect(); throw new IllegalStateException("Release unavailable"); }
        return connection;
    }
    void download(UpdateManifest item) {
        if (busy || closed) return;
        busy = true; activity.toast("正在下载更新，完成后将打开系统安装窗口");
        worker.execute(() -> {
            File file = null;
            try {
                File directory = new File(activity.getCacheDir(), "updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("No cache");
                file = File.createTempFile("release-", ".apk", directory);
                HttpURLConnection connection = connect(item.url);
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
                    if (connection.getContentLengthLong() > 0 && connection.getContentLengthLong() != item.size) throw new IllegalArgumentException("Wrong size");
                    byte[] bytes = new byte[32768]; int n; long total = 0;
                    while ((n = in.read(bytes)) != -1) {
                        total += n;
                        if (closed || Thread.currentThread().isInterrupted() || total > item.size) throw new IllegalArgumentException("Stopped");
                        hash.update(bytes, 0, n); out.write(bytes, 0, n);
                    }
                    if (total != item.size || !hex(hash.digest()).equals(item.sha256)) throw new IllegalArgumentException("Checksum mismatch");
                } finally { connection.disconnect(); }
                validatePackage(file, item);
                File ready = file;
                activity.runOnUiThread(() -> {
                    busy = false;
                    if (!usable()) { discard(ready); return; }
                    discard(pending); pending = ready; release = item; install();
                });
            } catch (Exception error) { discard(file); fail("更新未通过下载或签名校验，请稍后重试"); }
        });
    }
    @SuppressWarnings("deprecation")
    void validatePackage(File file, UpdateManifest item) throws Exception {
        PackageManager manager = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo current = manager.getPackageInfo(activity.getPackageName(), flags);
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName)
            || version(candidate) != item.code || !item.version.equals(candidate.versionName) || version(candidate) <= BuildConfig.VERSION_CODE)
            throw new IllegalArgumentException("Wrong package or version");
        Signature[] installed = signatures(current), incoming = signatures(candidate);
        if (installed == null || incoming == null || installed.length != 1 || incoming.length != 1
            || !MessageDigest.isEqual(installed[0].toByteArray(), incoming[0].toByteArray())) throw new IllegalArgumentException("Wrong signing certificate");
    }
    @SuppressWarnings("deprecation")
    private static Signature[] signatures(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
    }
    @SuppressWarnings("deprecation")
    private static long version(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    static String hex(byte[] bytes) {
        StringBuilder text = new StringBuilder(); for (byte b : bytes) text.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return text.toString();
    }
    private void install() {
        if (pending == null || !usable()) return;
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity).setTitle("允许安装应用更新")
                .setMessage("请在手机设置中允许期数采集台安装更新，返回后继续。每次安装仍由你确认。")
                .setNegativeButton("稍后", null).setPositiveButton("前往设置", (d, w) -> {
                    awaitingPermission = true;
                    try { activity.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())), INSTALL_PERMISSION); }
                    catch (ActivityNotFoundException error) { awaitingPermission = false; activity.toast("请在手机设置中开启此应用的安装更新权限"); }
                }).show();
            return;
        }
        try {
            // Recheck immediately before sharing the one verified file with the installer.
            validatePackage(pending, release);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new FileInputStream(pending)) { byte[] bytes = new byte[32768]; int n; while ((n = in.read(bytes)) != -1) digest.update(bytes, 0, n); }
            if (!hex(digest.digest()).equals(release.sha256)) throw new IllegalArgumentException("Changed APK");
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", pending);
            activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch (Exception error) { discard(pending); pending = null; activity.toast("无法启动更新安装，请重新检查更新"); }
    }
    void permissionResult() { if (awaitingPermission) { awaitingPermission = false; if (activity.getPackageManager().canRequestPackageInstalls()) { resumeInstall = true; resume(); } else activity.toast("未允许安装更新，可稍后在更多菜单中重试"); } }
    void resume() { if (resumeInstall && usable()) { resumeInstall = false; install(); } }
    private boolean usable() { return !closed && !activity.isFinishing() && !activity.isDestroyed() && !activity.appLocked() && activity.hasWindowFocus(); }
    private void fail(String text) { activity.runOnUiThread(() -> { busy = false; if (text != null && usable()) activity.toast(text); }); }
    private static void discard(File file) { if (file != null) file.delete(); }
    void close() { closed = true; worker.shutdownNow(); }
}
