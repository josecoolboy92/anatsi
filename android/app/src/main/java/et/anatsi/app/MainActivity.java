package et.anatsi.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

// Anatsi: the whole web app is packed in assets/ and served from a local https address,
// so it runs fully offline with no internet permission. A small bridge lets the page
// share text, save files and print.
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml"); MIME.put("png", "image/png"); MIME.put("jpg", "image/jpeg");
        MIME.put("woff2", "font/woff2"); MIME.put("txt", "text/plain");
    }
    private WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || !path.startsWith("/assets/")) return null;
                path = path.substring("/assets/".length());
                if (path.isEmpty()) path = "index.html";
                try {
                    InputStream in = getAssets().open(path);
                    String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
                    String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
                    WebResourceResponse r = new WebResourceResponse(mime, "UTF-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Access-Control-Allow-Origin", "*");
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", new HashMap<>(), null);
                }
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AnatsiAndroid");
        if (saved != null) web.restoreState(saved);
        else web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    class Bridge {
        @JavascriptInterface public boolean ready() { return true; }

        @JavascriptInterface public void share(String title, String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, title);
            i.putExtra(Intent.EXTRA_TEXT, text);
            startActivity(Intent.createChooser(i, title));
        }

        // Save a file the page made (CSV, backup) and offer it to other apps (Files, WhatsApp, Telegram, email)
        @JavascriptInterface public void saveFile(String name, String mime, String base64) {
            try {
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                File f = new File(ExportProvider.dir(MainActivity.this), safe);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(base64, Base64.DEFAULT)); }
                Uri uri = Uri.parse("content://et.anatsi.app.files/" + Uri.encode(safe));
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(i, safe));
            } catch (Exception e) { e.printStackTrace(); }
        }

        // Print or save as PDF with Android's printing
        @JavascriptInterface public void print(final String jobName) {
            runOnUiThread(new Runnable() { public void run() {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter a = web.createPrintDocumentAdapter(jobName);
                pm.print(jobName, a, new PrintAttributes.Builder().build());
            } });
        }
    }
}
