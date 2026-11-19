package com.aifx.observer;

import java.net.URI;
import java.util.Locale;

/** Only the configured first-party origin may stay inside the signed-in app. */
public final class SitePolicy {
    private SitePolicy() {}
    public static boolean isInternal(String value) {
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null || uri.getRawUserInfo() != null || !"8.134.37.202".equals(uri.getHost())) return false;
            scheme = scheme.toLowerCase(Locale.ROOT);
            return ("http".equals(scheme) && (uri.getPort() == -1 || uri.getPort() == 80))
                || ("https".equals(scheme) && (uri.getPort() == -1 || uri.getPort() == 443));
        } catch (Exception ignored) { return false; }
    }
    public static boolean isWebLink(String value) {
        try {
            URI uri = new URI(value);
            return uri.getHost() != null && uri.getRawUserInfo() == null
                && ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()));
        } catch (Exception ignored) { return false; }
    }
    public static boolean isInternalBlob(String value) {
        return value != null && value.startsWith("blob:") && isInternal(value.substring(5));
    }
    public static String fileName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]", "_").trim();
        if (clean.isEmpty() || clean.equals(".") || clean.equals("..")) return "期数采集资料.csv";
        return clean.length() > 100 ? clean.substring(clean.length() - 100) : clean;
    }
}
