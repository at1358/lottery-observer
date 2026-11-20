package com.aifx.observer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.util.ArrayList;
import androidx.fragment.app.FragmentActivity;

public final class MainActivity extends FragmentActivity {
    private static final int PICK_FILE = 1101;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<WebView> popups = new ArrayList<>();
    private WebView web;
    private FrameLayout webContainer;
    private View errorPanel;
    private ProgressBar progress;
    private TextView errorText;
    private ExportController exports;
    private AppLockController appLock;
    private UpdateController updates;
    private ValueCallback<Uri[]> fileCallback;
    private OnBackInvokedCallback backCallback;
    private String lastUrl = BuildConfig.HOME_URL;
    private boolean failed;
    private long lastBack;
    private final Runnable timeout = () -> showError("连接时间较长，请检查网络后重新加载。后台定时任务不受影响。");

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        View root = findViewById(R.id.root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        } else root.setFitsSystemWindows(true);
        webContainer = findViewById(R.id.web_container);
        errorPanel = findViewById(R.id.error_panel);
        errorText = findViewById(R.id.error_text);
        progress = findViewById(R.id.progress);
        exports = new ExportController(this);
        findViewById(R.id.back).setOnClickListener(v -> back());
        findViewById(R.id.refresh).setOnClickListener(v -> reload());
        findViewById(R.id.more).setOnClickListener(this::menu);
        findViewById(R.id.retry).setOnClickListener(v -> load(lastUrl));
        findViewById(R.id.home).setOnClickListener(v -> load(BuildConfig.HOME_URL));
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::back;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        if (createWebView()) {
            if (state != null && web.restoreState(state) != null && SitePolicy.isInternal(web.getUrl())) lastUrl = web.getUrl();
            else load(BuildConfig.HOME_URL);
        }
        appLock = new AppLockController(this);
        updates = new UpdateController(this);
    }

    // React needs JavaScript. File access and native JavascriptInterface bridges
    // stay disabled; exports use an origin-restricted AndroidX message listener.
    @SuppressLint("SetJavaScriptEnabled")
    private boolean createWebView() {
        try {
            web = new WebView(this);
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setGeolocationEnabled(false);
            settings.setSafeBrowsingEnabled(true);
            settings.setSupportMultipleWindows(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setMediaPlaybackRequiresUserGesture(true);
            settings.setUserAgentString(settings.getUserAgentString() + " PeriodObserverAndroid/" + BuildConfig.VERSION_NAME);
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
            web.setWebViewClient(new SiteClient());
            web.setWebChromeClient(new Chrome());
            exports.attach(web);
            webContainer.addView(web, new FrameLayout.LayoutParams(-1, -1));
            return true;
        } catch (RuntimeException error) {
            if (web != null) { webContainer.removeView(web); web.destroy(); web = null; }
            showError("系统网页组件暂不可用。请更新 Android System WebView 或 Chrome，然后重新加载。");
            return false;
        }
    }

    private void load(String url) {
        if (!SitePolicy.isInternal(url)) url = BuildConfig.HOME_URL;
        if (web == null && !createWebView()) return;
        web.loadUrl(url);
    }
    private void reload() {
        if (web == null || failed) load(lastUrl);
        else web.reload();
    }
    private void showError(String text) {
        if (isFinishing() || isDestroyed()) return;
        failed = true;
        handler.removeCallbacks(timeout);
        progress.setVisibility(View.GONE);
        errorText.setText(text);
        errorPanel.setVisibility(View.VISIBLE);
    }
    private boolean route(String url) {
        if (SitePolicy.isInternal(url)) return false;
        if (SitePolicy.isWebLink(url)) {
            new AlertDialog.Builder(this).setTitle("打开外部网页")
                .setMessage("该链接将交给手机浏览器打开，应用内的登录状态不会传给外站。\n\n" + Uri.parse(url).getHost())
                .setNegativeButton("取消", null).setPositiveButton("打开", (d, w) -> openBrowser(url)).show();
        } else toast("暂不支持此类链接");
        return true;
    }
    private void openBrowser(String url) {
        if (!SitePolicy.isWebLink(url)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException ignored) { toast("未找到可用的手机浏览器"); }
    }
    private void menu(View anchor) {
        if (appLocked()) return;
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "返回首页");
        menu.getMenu().add(0, 2, 1, "刷新页面");
        menu.getMenu().add(0, 3, 2, "在浏览器中打开");
        menu.getMenu().add(0, 4, 3, "清除本机登录状态");
        menu.getMenu().add(0, 5, 4, "关于应用");
        menu.getMenu().add(0, 6, 3, appLock.enabled() ? "关闭指纹登录" : "启用指纹登录");
        menu.getMenu().add(0, 7, 4, "检查应用更新");
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1: load(BuildConfig.HOME_URL); break;
                case 2: reload(); break;
                case 3: openBrowser(lastUrl); break;
                case 4: new AlertDialog.Builder(this).setTitle("清除本机登录状态？")
                    .setMessage("需要重新输入网站账号密码。服务器上的资料、计算结果和定时任务不受影响。")
                    .setNegativeButton("取消", null).setPositiveButton("清除并重新登录", (dialog, which) -> {
                        clearLogin();
                    }).show(); break;
                case 5: new AlertDialog.Builder(this).setTitle(getString(R.string.app_name) + " " + BuildConfig.VERSION_NAME)
                    .setMessage("连接服务器：8.134.37.202\n登录最长保留90天，改密、停用账号或退出后需重新登录。\n支持指纹解锁和服务器版本更新。网页功能更新后，重新打开即可使用。\n\n当前连接为 HTTP，登录传输未加密。")
                    .setPositiveButton("知道了", null).show(); break;
                case 6: appLock.toggle(); break;
                case 7: updates.check(true); break;
                default: return false;
            }
            return true;
        });
        menu.show();
    }
    private void back() {
        if (appLocked()) { finish(); return; }
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        long now = SystemClock.elapsedRealtime();
        if (lastBack != 0 && now - lastBack < 2000) finish();
        else { lastBack = now; toast("再按一次返回键退出应用"); }
    }
    // Android 13+ uses the OnBackInvokedCallback registered in onCreate.
    // Keep this override exclusively for Android 8–12 and older back buttons.
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation") @Override public void onBackPressed() { back(); }
    void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    boolean appLocked() { return appLock != null && appLock.isLocked(); }
    void unlocked() { if (updates != null) handler.postDelayed(() -> updates.check(false), 500); }
    void clearLogin() {
        appLock.reset();
        if (web != null) web.stopLoading();
        CookieManager.getInstance().removeAllCookies(done -> {
            CookieManager.getInstance().flush(); WebStorage.getInstance().deleteAllData();
            if (web != null) { web.clearCache(true); web.clearHistory(); }
            load(BuildConfig.HOME_URL);
        });
    }

    private final class SiteClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return request.isForMainFrame() && route(request.getUrl().toString());
        }
        @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
            if (!SitePolicy.isInternal(url)) return;
            lastUrl = url; failed = false;
            errorPanel.setVisibility(View.GONE); progress.setProgress(5); progress.setVisibility(View.VISIBLE);
            handler.removeCallbacks(timeout); handler.postDelayed(timeout, 45000);
        }
        @Override public void onPageFinished(WebView view, String url) {
            handler.removeCallbacks(timeout); progress.setVisibility(View.GONE);
            if (!failed && SitePolicy.isInternal(url)) {
                errorPanel.setVisibility(View.GONE);
                exports.installBlobSupport(view);
                CookieManager.getInstance().flush();
            }
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError("请检查手机网络或服务器是否可访问，然后重新加载。");
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) showError("服务器暂时无法打开此页面（" + response.getStatusCode() + "）。请稍后重新加载。");
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler ssl, SslError error) {
            ssl.cancel(); showError("安全连接校验未通过，请检查服务器证书后重新加载。");
        }
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view == web) { webContainer.removeView(view); view.destroy(); web = null; }
            showError("网页组件已停止，请点重新加载。服务器资料已保留。");
            return true;
        }
    }
    private final class Chrome extends WebChromeClient {
        @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (!SitePolicy.isInternal(view.getUrl())) { callback.onReceiveValue(null); return true; }
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try { startActivityForResult(intent, PICK_FILE); }
            catch (ActivityNotFoundException ignored) { fileCallback.onReceiveValue(null); fileCallback = null; toast("未找到系统文件选择器"); }
            return true;
        }
        @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message message) {
            if (!gesture) return false;
            WebView popup = new WebView(MainActivity.this);
            popup.getSettings().setAllowFileAccess(false); popup.getSettings().setAllowContentAccess(false);
            popups.add(popup);
            popup.setWebViewClient(new WebViewClient() {
                private boolean handled;
                private void forward(String url) {
                    if (handled || "about:blank".equals(url)) return;
                    handled = true;
                    if (SitePolicy.isInternal(url)) load(url); else route(url);
                    handler.post(() -> { popups.remove(popup); popup.destroy(); });
                }
                @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) { forward(request.getUrl().toString()); return true; }
                @Override public void onPageStarted(WebView child, String url, Bitmap icon) { forward(url); }
            });
            ((WebView.WebViewTransport) message.obj).setWebView(popup); message.sendToTarget();
            handler.postDelayed(() -> { if (popups.remove(popup)) popup.destroy(); }, 10000);
            return true;
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileCallback != null) {
            Uri[] selected = null;
            if (result == RESULT_OK && data != null) {
                ArrayList<Uri> files = new ArrayList<>();
                if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) files.add(data.getClipData().getItemAt(i).getUri());
                else if (data.getData() != null) files.add(data.getData());
                selected = files.stream().filter(uri -> "content".equals(uri.getScheme())).toArray(Uri[]::new);
            }
            fileCallback.onReceiveValue(selected); fileCallback = null;
        } else if (request == ExportController.SAVE_FILE) exports.saveResult(result, data);
        else if (request == UpdateController.INSTALL_PERMISSION) updates.permissionResult();
    }
    @Override protected void onSaveInstanceState(Bundle out) { if (web != null) web.saveState(out); super.onSaveInstanceState(out); }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused && updates != null) updates.resume(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); if (appLock != null) appLock.resume(); if (updates != null) handler.postDelayed(() -> updates.check(false), 2000); }
    @Override protected void onPause() { if (appLock != null) appLock.pause(); if (web != null) web.onPause(); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (appLock != null) appLock.close();
        if (updates != null) updates.close();
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        for (WebView popup : popups) popup.destroy(); popups.clear();
        if (web != null) { webContainer.removeView(web); web.destroy(); web = null; }
        exports.close(); super.onDestroy();
    }
}
