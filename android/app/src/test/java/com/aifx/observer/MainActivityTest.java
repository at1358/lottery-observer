package com.aifx.observer;

import android.net.Uri;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.FrameLayout;
import java.time.Duration;
import java.util.Collections;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class MainActivityTest {
    @Test public void appLaunchesTheServerWithoutCredentialsOrLocalFileAccess() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            WebView web = (WebView) ((FrameLayout) activity.findViewById(R.id.web_container)).getChildAt(0);
            assertNotNull("WebView should be created", web);
            assertEquals(BuildConfig.HOME_URL, Shadows.shadowOf(web).getLastLoadedUrl());
            assertTrue(web.getSettings().getJavaScriptEnabled());
            assertTrue(web.getSettings().getDomStorageEnabled());
            assertFalse(web.getSettings().getAllowFileAccess());
            assertFalse(web.getSettings().getAllowContentAccess());
            assertTrue(web.getSettings().getUserAgentString().contains("PeriodObserverAndroid/"));
            assertEquals(View.GONE, activity.findViewById(R.id.error_panel).getVisibility());
        }
    }
    @Test public void onlyMainFrameFailuresReplaceThePageAndRetryTargetsTheSameServer() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            WebView web = (WebView) ((FrameLayout) activity.findViewById(R.id.web_container)).getChildAt(0);
            String page = "http://8.134.37.202/m?view=sources";
            web.getWebViewClient().onPageStarted(web, page, null);
            WebResourceError error = new WebResourceError() {
                @Override public int getErrorCode() { return -2; }
                @Override public CharSequence getDescription() { return "Network unavailable"; }
            };
            web.getWebViewClient().onReceivedError(web, request(false), error);
            assertEquals(View.GONE, activity.findViewById(R.id.error_panel).getVisibility());
            web.getWebViewClient().onReceivedError(web, request(true), error);
            assertEquals(View.VISIBLE, activity.findViewById(R.id.error_panel).getVisibility());
            activity.findViewById(R.id.retry).performClick();
            assertEquals(page, Shadows.shadowOf(web).getLastLoadedUrl());
        }
    }
    @Test public void returningTwiceFromTheRootExitsTheApp() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            ShadowSystemClock.advanceBy(Duration.ofSeconds(1));
            activity.onBackPressed(); assertFalse(activity.isFinishing());
            ShadowSystemClock.advanceBy(Duration.ofMillis(100));
            activity.onBackPressed(); assertTrue(activity.isFinishing());
        }
    }
    private static WebResourceRequest request(boolean mainFrame) {
        return new WebResourceRequest() {
            @Override public Uri getUrl() { return Uri.parse("http://8.134.37.202/m?view=sources"); }
            @Override public boolean isForMainFrame() { return mainFrame; }
            @Override public boolean isRedirect() { return false; }
            @Override public boolean hasGesture() { return false; }
            @Override public String getMethod() { return "GET"; }
            @Override public Map<String, String> getRequestHeaders() { return Collections.emptyMap(); }
        };
    }
}
