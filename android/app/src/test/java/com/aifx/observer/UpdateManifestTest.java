package com.aifx.observer;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk = 35)
public class UpdateManifestTest {
    private JSONObject valid() throws Exception {
        return new JSONObject().put("versionCode", 3).put("versionName", "1.2.0").put("packageName", "com.aifx.observer")
            .put("url", "http://8.134.37.202/app-downloads/PeriodObserver-1.2.0.apk").put("sha256", "a".repeat(64)).put("size", 100000);
    }
    @Test public void publishedSameServerReleaseIsAccepted() throws Exception {
        UpdateManifest release = new UpdateManifest(valid().toString());
        assertEquals(3, release.code); assertEquals("1.2.0", release.version); assertEquals(100000, release.size);
    }
    @Test public void refusesOtherServersPathsCredentialsFragmentsAndPackageNames() throws Exception {
        for (String url : new String[]{"http://evil.example/app.apk", "http://8.134.37.202.evil.example/app.apk",
            "http://user@8.134.37.202/app-downloads/PeriodObserver-1.2.0.apk", "http://8.134.37.202:8888/app-downloads/PeriodObserver-1.2.0.apk",
            "http://8.134.37.202/app-downloads/../other.apk", "http://8.134.37.202/app-downloads/PeriodObserver-1.2.0.apk?other=1",
            "http://8.134.37.202/app-downloads/PeriodObserver-1.2.0.apk#fragment"}) reject(valid().put("url", url));
        reject(valid().put("packageName", "com.other.app")); reject(valid().put("sha256", "bad"));
        reject(valid().put("size", 200000000)); reject(valid().put("size", 1)); reject(valid().put("versionCode", 0));
        reject(valid().put("versionName", "1.3.0"));
    }
    private void reject(JSONObject value) throws Exception {
        try { new UpdateManifest(value.toString()); fail("Invalid release accepted: " + value); }
        catch (IllegalArgumentException expected) { /* Required. */ }
    }
}
