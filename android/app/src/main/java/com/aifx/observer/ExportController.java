package com.aifx.observer;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-selected saves use Android's document picker, with no storage permission. */
final class ExportController {
    static final int SAVE_FILE = 1102;
    private static final int MAX_BLOB = 10 * 1024 * 1024;
    private static final int MAX_HTTP = 50 * 1024 * 1024;
    private final MainActivity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean closed;
    private boolean busy;
    private File pending;

    ExportController(MainActivity activity) { this.activity = activity; }

    void attach(WebView web) {
        boolean messageSupport = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (messageSupport) {
            WebViewCompat.addWebMessageListener(web, "ObserverExport",
                new HashSet<>(Arrays.asList("http://8.134.37.202", "https://8.134.37.202")),
                (view, message, origin, mainFrame, reply) -> {
                    if (closed || !mainFrame || !SitePolicy.isInternal(origin.toString()) || !SitePolicy.isInternal(view.getUrl())) return;
                    String value = message.getData();
                    if (value == null || value.length() > MAX_BLOB * 4 / 3 + 4096) { activity.toast("文件过大，请在浏览器中导出"); return; }
                    try {
                        JSONObject item = new JSONObject(value);
                        if ("error".equals(item.optString("type"))) { activity.toast("导出暂未完成，请重试或在浏览器中打开后导出"); return; }
                        if (!"download".equals(item.optString("type")) || busy) return;
                        busy = true;
                        String data = item.getString("data"), name = SitePolicy.fileName(item.optString("name")), mime = mime(item.optString("mime"));
                        worker.execute(() -> {
                            File file = null;
                            try {
                                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                                if (bytes.length > MAX_BLOB) throw new IllegalArgumentException("Large export");
                                file = File.createTempFile("observer-export-", ".tmp", activity.getCacheDir());
                                try (OutputStream out = new FileOutputStream(file)) { out.write(bytes); }
                                ready(file, name, mime);
                            } catch (Exception error) { discard(file); failed(); }
                        });
                    } catch (Exception error) { busy = false; activity.toast("无法读取导出文件，请重试"); }
                });
        }
        web.setDownloadListener((url, agent, disposition, contentType, size) -> {
            if (closed || !SitePolicy.isInternal(web.getUrl()) || busy) return;
            String name = SitePolicy.fileName(URLUtil.guessFileName(url, disposition, contentType));
            if (SitePolicy.isInternalBlob(url)) {
                if (!messageSupport) { activity.toast("请更新 Android System WebView 后导出，或在手机浏览器中打开"); return; }
                // The page creates a Blob then revokes it immediately. installBlobSupport
                // delays revocation so this fetch can finish without changing website code.
                String script = "(function(){fetch(" + JSONObject.quote(url) + ").then(r=>r.blob()).then(b=>{"
                    + "if(b.size>" + MAX_BLOB + ")throw Error('large');const f=new FileReader();"
                    + "f.onload=()=>ObserverExport.postMessage(JSON.stringify({type:'download',name:" + JSONObject.quote(name)
                    + ",mime:b.type,data:String(f.result).split(',')[1]}));f.onerror=()=>ObserverExport.postMessage('{\"type\":\"error\"}');"
                    + "f.readAsDataURL(b);}).catch(()=>ObserverExport.postMessage('{\"type\":\"error\"}'));})();";
                web.evaluateJavascript(script, null);
            } else if (SitePolicy.isInternal(url)) {
                busy = true;
                String cookies = CookieManager.getInstance().getCookie(url);
                activity.toast("正在准备下载文件");
                worker.execute(() -> download(url, cookies, agent, name, mime(contentType)));
            } else activity.toast("请在手机浏览器中打开此下载链接");
        });
    }

    void installBlobSupport(WebView web) {
        if (!SitePolicy.isInternal(web.getUrl())) return;
        web.evaluateJavascript("(function(){if(window.__observerExportReady)return;window.__observerExportReady=true;"
            + "const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=function(url){setTimeout(()=>revoke(url),20000);};})();", null);
    }
    private static String mime(String value) {
        String clean = value == null ? "" : value.split(";", 2)[0].trim();
        return clean.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+") ? clean : "application/octet-stream";
    }
    private void download(String first, String cookie, String agent, String name, String mime) {
        HttpURLConnection connection = null;
        File file = null;
        try {
            String url = first;
            for (int hop = 0; hop < 4; hop++) {
                if (!SitePolicy.isInternal(url) || closed) throw new IllegalStateException("Unsupported destination");
                connection = (HttpURLConnection) new URI(url).toURL().openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(20000); connection.setReadTimeout(20000);
                if (cookie != null) connection.setRequestProperty("Cookie", cookie);
                connection.setRequestProperty("User-Agent", agent);
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IllegalStateException("Missing redirect");
                    url = new URI(url).resolve(location).toString();
                    connection.disconnect(); connection = null; continue;
                }
                if (status != 200 || connection.getContentLengthLong() > MAX_HTTP) throw new IllegalStateException("Download unavailable");
                file = File.createTempFile("observer-export-", ".tmp", activity.getCacheDir());
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(file)) {
                    byte[] buffer = new byte[32768]; int read, total = 0;
                    while ((read = in.read(buffer)) != -1) {
                        total += read;
                        if (closed || Thread.currentThread().isInterrupted() || total > MAX_HTTP) throw new IllegalStateException("Download stopped");
                        out.write(buffer, 0, read);
                    }
                }
                ready(file, name, mime); return;
            }
            throw new IllegalStateException("Redirect limit");
        } catch (Exception error) { discard(file); failed(); }
        finally { if (connection != null) connection.disconnect(); }
    }
    private void ready(File file, String name, String mime) {
        activity.runOnUiThread(() -> {
            if (closed || activity.isFinishing() || activity.isDestroyed()) { discard(file); return; }
            pending = file;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime)
                .putExtra(Intent.EXTRA_TITLE, name);
            try { activity.startActivityForResult(intent, SAVE_FILE); }
            catch (ActivityNotFoundException ignored) { discard(pending); pending = null; busy = false; activity.toast("未找到系统文件保存窗口"); }
        });
    }
    void saveResult(int result, Intent data) {
        File file = pending; pending = null;
        if (file == null) { busy = false; return; }
        if (result != Activity.RESULT_OK || data == null || data.getData() == null || !"content".equals(data.getData().getScheme())) {
            discard(file); busy = false; return;
        }
        Uri target = data.getData();
        worker.execute(() -> {
            boolean success = false;
            try (InputStream in = new FileInputStream(file); OutputStream out = activity.getContentResolver().openOutputStream(target, "wt")) {
                if (out == null) throw new IllegalStateException("No document");
                byte[] buffer = new byte[32768]; int read;
                while ((read = in.read(buffer)) != -1) { if (closed) throw new IllegalStateException("Stopped"); out.write(buffer, 0, read); }
                success = true;
            } catch (Exception ignored) { /* Only the user-selected document is ever written. */ }
            finally { discard(file); }
            boolean saved = success;
            activity.runOnUiThread(() -> { busy = false; if (!closed) activity.toast(saved ? "文件已保存到选择的位置" : "保存未完成，请重新导出并选择保存位置"); });
        });
    }
    private void failed() { activity.runOnUiThread(() -> { busy = false; if (!closed) activity.toast("下载失败或登录已失效，请检查网络并重新登录后再试"); }); }
    private static void discard(File file) { if (file != null) file.delete(); }
    void close() { closed = true; worker.shutdownNow(); discard(pending); pending = null; }
}
