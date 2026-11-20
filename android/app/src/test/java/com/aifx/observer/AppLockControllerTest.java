package com.aifx.observer;

import android.content.Context;
import android.view.WindowManager;
import android.webkit.CookieManager;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk = 35)
public class AppLockControllerTest {
    @Before public void reset() {
        Context context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("app-security", 0).edit().clear().commit();
        CookieManager.getInstance().removeAllCookies(null);
    }
    @Test public void fingerprintIsOptionalAndDoesNotBlockFirstPasswordLogin() {
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            assertFalse(controller.get().appLocked()); assertFalse(AppLockController.hasSession());
        }
    }
    @Test public void savedSessionWithBiometricEnabledStartsCoveredAndCanBeCleared() {
        Context context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("app-security", 0).edit().putBoolean("biometric", true).commit();
        CookieManager.getInstance().setCookie(BuildConfig.HOME_URL, "observer_session=" + "a".repeat(64) + "; Path=/; Max-Age=7776000");
        assertTrue(AppLockController.hasSession());
        try (ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get(); assertTrue(activity.appLocked());
            assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
            activity.clearLogin(); assertFalse(activity.appLocked());
            assertFalse(context.getSharedPreferences("app-security", 0).getBoolean("biometric", true));
        }
    }
}
