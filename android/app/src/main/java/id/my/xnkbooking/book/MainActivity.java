package id.my.xnkbooking.book;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Thin shell around book.xnkbooking.my.id (the wrapper page that hosts the Apps Script portal).
public class MainActivity extends Activity {
    private static final String HOME = "https://book.xnkbooking.my.id/";
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF0B0B0B);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(false); // target=_blank links come through shouldOverrideUrlLoading
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // the portal is a script.google.com iframe

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                if (isOurs(uri)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri)); // wa.me, tel:, maps, etc.
                } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
    }

    private static boolean isOurs(Uri uri) {
        String scheme = uri.getScheme(), host = uri.getHost();
        if (host == null || !("https".equals(scheme) || "http".equals(scheme))) return false;
        return host.endsWith("xnkbooking.my.id") || host.endsWith("xnk.my.id")
            || host.endsWith("google.com") || host.endsWith("googleusercontent.com");
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
