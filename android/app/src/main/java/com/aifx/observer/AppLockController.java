package com.aifx.observer;

import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

/** Unlocks this device's existing session, without reading or retaining passwords. */
final class AppLockController {
    private final MainActivity activity;
    private final SharedPreferences preferences;
    private final View cover;
    private BiometricPrompt prompt;
    private boolean locked, authenticating, closed;
    private long backgroundAt;

    AppLockController(MainActivity activity) {
        this.activity = activity;
        preferences = activity.getSharedPreferences("app-security", 0);
        LinearLayout panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(Gravity.CENTER);
        panel.setPadding(32, 32, 32, 32); panel.setBackgroundColor(Color.rgb(242, 247, 255));
        TextView title = new TextView(activity); title.setText("期数采集台\n验证后继续登录");
        title.setTextSize(23); title.setGravity(Gravity.CENTER); title.setTextColor(Color.rgb(24, 49, 87));
        panel.addView(title);
        Button unlock = new Button(activity); unlock.setText("指纹 / 手机锁屏验证");
        unlock.setOnClickListener(v -> authenticate(false)); panel.addView(unlock);
        Button password = new Button(activity); password.setText("改用网站账号密码登录");
        password.setOnClickListener(v -> new AlertDialog.Builder(activity).setTitle("重新登录？")
            .setMessage("将清除本机登录状态并关闭指纹解锁，服务器资料不受影响。")
            .setNegativeButton("取消", null).setPositiveButton("重新登录", (d, w) -> activity.clearLogin()).show());
        panel.addView(password); panel.setVisibility(View.GONE);
        ((FrameLayout) activity.findViewById(android.R.id.content)).addView(panel, new FrameLayout.LayoutParams(-1, -1));
        cover = panel;
        if (enabled()) { locked = true; secure(true); cover.setVisibility(View.VISIBLE); }
    }
    boolean enabled() { return preferences.getBoolean("biometric", false); }
    boolean isLocked() { return locked; }
    static boolean hasSession() {
        String cookies = CookieManager.getInstance().getCookie(BuildConfig.HOME_URL);
        return cookies != null && cookies.matches("(?s).*(?:^|;\\s*)observer_session=[a-f0-9]{64}(?:;.*|$)");
    }
    void toggle() {
        if (locked) return;
        if (enabled()) {
            new AlertDialog.Builder(activity).setTitle("关闭指纹登录？")
                .setMessage("此手机仍保留网站登录状态。")
                .setNegativeButton("取消", null).setPositiveButton("关闭", (d, w) -> reset()).show();
        } else if (!hasSession()) activity.toast("请先使用网站账号密码登录，再启用指纹登录");
        else if (BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) != BiometricManager.BIOMETRIC_SUCCESS)
            activity.toast("请先在手机设置中录入指纹；此设备需要支持系统生物识别");
        else authenticate(true);
    }
    private void authenticate(boolean enabling) {
        if (closed || authenticating) return;
        authenticating = true;
        prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                authenticating = false;
                if (closed) return;
                if (enabling) { preferences.edit().putBoolean("biometric", true).apply(); secure(true); activity.toast("指纹登录已启用"); }
                locked = false; backgroundAt = 0; cover.setVisibility(View.GONE); activity.unlocked();
            }
            @Override public void onAuthenticationError(int code, CharSequence message) {
                authenticating = false;
                if (!closed && code != BiometricPrompt.ERROR_USER_CANCELED && code != BiometricPrompt.ERROR_CANCELED)
                    activity.toast("验证未完成，可重试或改用网站账号密码登录");
            }
        });
        prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle(enabling ? "启用指纹登录" : "登录期数采集台")
            .setSubtitle("使用手机已录入的指纹或锁屏凭证验证")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL).build());
    }
    void resume() {
        if (!enabled()) return;
        if (!hasSession()) { reset(); return; }
        if (backgroundAt != 0 && SystemClock.elapsedRealtime() - backgroundAt >= 60000) locked = true;
        if (locked) { cover.setVisibility(View.VISIBLE); cover.bringToFront(); authenticate(false); }
        else cover.setVisibility(View.GONE);
    }
    void pause() {
        if (enabled()) { backgroundAt = SystemClock.elapsedRealtime(); cover.setVisibility(View.VISIBLE); cover.bringToFront(); }
    }
    void reset() {
        if (prompt != null) prompt.cancelAuthentication();
        preferences.edit().putBoolean("biometric", false).apply(); locked = false; authenticating = false;
        cover.setVisibility(View.GONE); secure(false);
    }
    private void secure(boolean enabled) {
        if (enabled) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    void close() { closed = true; if (prompt != null) prompt.cancelAuthentication(); }
}
