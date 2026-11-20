package com.aifx.observer;

import java.net.URI;
import org.json.JSONObject;

/** The server can advertise releases only from its dedicated download directory. */
final class UpdateManifest {
    static final String URL = "http://8.134.37.202/app-downloads/latest.json";
    final int code;
    final String version, url, sha256, notes;
    final long size;
    UpdateManifest(String json) throws Exception {
        JSONObject value = new JSONObject(json);
        code = value.getInt("versionCode"); version = value.getString("versionName");
        url = value.getString("url"); sha256 = value.getString("sha256"); size = value.getLong("size");
        notes = value.optString("notes", "优化登录及应用体验");
        URI target = new URI(url);
        if (code < 1 || !version.matches("\\d+\\.\\d+\\.\\d+") || !sha256.matches("[a-f0-9]{64}")
            || size < 4096 || size > 100L * 1024 * 1024 || notes.length() > 2000
            || !SitePolicy.isInternal(url) || target.getRawQuery() != null || target.getRawFragment() != null
            || !target.getRawPath().equals("/app-downloads/PeriodObserver-" + version + ".apk")
            || !"com.aifx.observer".equals(value.getString("packageName"))) throw new IllegalArgumentException("Invalid release");
    }
}
