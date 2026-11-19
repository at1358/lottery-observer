package com.aifx.observer;

import org.junit.Test;
import static org.junit.Assert.*;

public class SitePolicyTest {
    @Test public void onlyExactFirstPartyOriginsStayInside() {
        for (String url : new String[]{"http://8.134.37.202/m", "http://8.134.37.202:80/m?view=sources", "https://8.134.37.202:443/materials/a", "HTTP://8.134.37.202/m"}) assertTrue(url, SitePolicy.isInternal(url));
        for (String url : new String[]{"http://8.134.37.202.evil.example/m", "http://8.134.37.202@evil.example/", "http://evil@8.134.37.202/", "http://8.134.37.202:8080/m", "https://8.134.37.202:80/", "http://8.134.37.202\\@evil.example/", "file:///etc/passwd", "javascript:alert(1)", "intent://settings", "http://2130706433/", "http://127.0.0.1/", "//8.134.37.202/m", "", null}) assertFalse(String.valueOf(url), SitePolicy.isInternal(url));
    }
    @Test public void blobExportsAreBoundToFirstParty() {
        assertTrue(SitePolicy.isInternalBlob("blob:http://8.134.37.202/550e8400-e29b"));
        assertFalse(SitePolicy.isInternalBlob("blob:https://external.example/export"));
        assertFalse(SitePolicy.isInternalBlob("data:text/csv,secret"));
    }
    @Test public void externalBrowserOnlyReceivesOrdinaryWebLinks() {
        assertTrue(SitePolicy.isWebLink("https://example.com/articles?q=15"));
        for (String url : new String[]{"intent://scan", "javascript:alert(1)", "file:///sdcard/private", "https://user:password@example.com/", "data:text/html,test", "https:///missing-host"}) assertFalse(url, SitePolicy.isWebLink(url));
    }
    @Test public void documentNamesCannotIntroducePathsOrControlCharacters() {
        assertEquals("期数采集资料.csv", SitePolicy.fileName("期数采集资料.csv"));
        assertEquals(".._private_bad_.json", SitePolicy.fileName("../private\nbad?.json"));
        assertEquals("期数采集资料.csv", SitePolicy.fileName(".."));
        assertEquals("期数采集资料.csv", SitePolicy.fileName(null));
        assertEquals(100, SitePolicy.fileName("x".repeat(200)).length());
    }
}
