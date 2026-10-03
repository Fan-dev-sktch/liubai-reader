package app.liubai.reader;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.hardware.Sensor;
import android.media.AudioManager;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Rect;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.DisplayCutout;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String INCOMING = "__incoming__/";
    private static final int PICK_BOOK = 71;
    private static final int SAVE_FILE = 72;

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private boolean darkBars;
    private boolean immersive;
    private boolean resumed;
    private boolean pageReady;
    private int safeTop = -1, safeBottom = -1;

    // export
    private File exportFile;
    private FileOutputStream exportStream;
    private String exportToken, exportName, exportMime;
    private boolean selectingDestination;

    // brightness
    private int brightnessMode = -1;
    private boolean nightBrightness;
    private float ambientLux = -1f, appliedBrightness = -1f;
    private long lastBrightnessUpdate;
    private SensorManager lightManager;
    private Sensor lightSensor;
    private boolean lightRegistered;

    // reader helpers
    private volatile boolean volumeKeys;

    // files opened from other apps
    private final Map<String, Uri> incoming = Collections.synchronizedMap(new HashMap<>());
    private final List<JSONObject> pendingIncoming = Collections.synchronizedList(new ArrayList<>());

    private final Runnable restoreImmersive = this::applyImmersiveMode;

    private final SensorEventListener lightListener = new SensorEventListener() {
        @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        @Override public void onSensorChanged(SensorEvent event) {
            if (brightnessMode != -2 || !resumed || event.values.length == 0) return;
            float lux = event.values[0];
            if (Float.isNaN(lux) || Float.isInfinite(lux) || lux < 0f) return;
            ambientLux = ambientLux >= 0f ? lux * 0.2f + ambientLux * 0.8f : lux;
            long now = SystemClock.elapsedRealtime();
            if (lastBrightnessUpdate != 0 && now - lastBrightnessUpdate < 800) return;
            float log = (float) Math.log10(ambientLux + 1f);
            float target = nightBrightness ? Math.min(0.65f, log * 0.125f + 0.025f) : Math.min(1f, log * 0.23f + 0.04f);
            if (appliedBrightness >= 0f) target = (target - appliedBrightness) * 0.35f + appliedBrightness;
            if (appliedBrightness < 0f || Math.abs(target - appliedBrightness) >= 0.008f) {
                applyBrightness(target);
                appliedBrightness = target;
            }
            lastBrightnessUpdate = now;
        }
    };

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        int paper = Color.rgb(246, 245, 240);
        getWindow().setStatusBarColor(paper);
        getWindow().setNavigationBarColor(paper);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root = new FrameLayout(this);
        root.setBackgroundColor(paper);
        try {
            web = new ReaderWebView(this);
        } catch (Throwable missing) {
            // System WebView disabled, updating or absent on this phone.
            android.widget.TextView t = new android.widget.TextView(this);
            int pad = (int) (24 * getResources().getDisplayMetrics().density);
            t.setPadding(pad, pad * 3, pad, pad);
            t.setTextSize(16);
            t.setLineSpacing(0, 1.4f);
            t.setTextColor(Color.rgb(40, 40, 40));
            t.setText(tr("留白需要系统的网页组件（Android System WebView）才能运行，但它目前不可用。\n\n请在应用商店更新或启用「Android System WebView」/「Chrome」，然后重新打开留白。",
                "留白需要系統的網頁元件（Android System WebView）才能執行，但它目前無法使用。\n\n請在應用程式商店更新或啟用「Android System WebView」/「Chrome」，然後重新開啟留白。",
                "Liubai needs Android System WebView, which isn't available right now.\n\nPlease update or enable “Android System WebView” or “Chrome” in the app store, then open Liubai again.",
                "Liubai a besoin d’Android System WebView, qui n’est pas disponible pour le moment.\n\nMettez à jour ou activez « Android System WebView » ou « Chrome » depuis la boutique, puis rouvrez Liubai."));
            root.addView(t);
            setContentView(root);
            return;
        }
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets((immersive ? 0 : WindowInsets.Type.systemBars()) | WindowInsets.Type.ime());
                Insets cut = insets.getInsets(WindowInsets.Type.displayCutout());
                int top = immersive ? bars.top : Math.max(bars.top, cut.top);
                int bottom = immersive ? bars.bottom : Math.max(bars.bottom, cut.bottom);
                v.setPadding(Math.max(bars.left, cut.left), top, Math.max(bars.right, cut.right), bottom);
                publishSafeArea(immersive ? cut.top : 0, immersive ? cut.bottom : 0);
                return insets;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setBackgroundColor(paper);
        web.addJavascriptInterface(new Bridge(), "LiubaiAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return resource(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isLocal(url)) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(url);
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Low-memory phones may kill the renderer while a huge book is open:
                // rebuild the page instead of letting the whole app crash.
                if (view == web) {
                    root.removeView(web);
                    web.destroy();
                    web = null;
                    pageReady = false;
                    recreate();
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (url.startsWith("https://" + HOST + "/")) {
                    view.evaluateJavascript("document.documentElement.dataset.platform='android'", null);
                    safeTop = -1;
                    safeBottom = -1;
                    root.requestApplyInsets();
                    pageReady = true;
                    notifyIncoming();
                }
            }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return resource(request.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accept = params.getAcceptTypes();
                boolean images = accept != null && accept.length > 0 && accept[0] != null && accept[0].startsWith("image/");
                i.setType(images ? "image/*" : "*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivityForResult(i, PICK_BOOK);
                } catch (Exception e) {
                    chooser.onReceiveValue(null);
                    chooser = null;
                    notice(tr("无法打开系统文件选择器", "無法開啟系統檔案選擇器", "Can't open the file picker", "Impossible d’ouvrir le sélecteur de fichiers"));
                }
                return true;
            }
        });
        CookieManager.getInstance().setAcceptCookie(false);
        Intent launch = getIntent();
        boolean fromHistory = launch != null && (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (state == null && !fromHistory) handleIntent(launch);
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        notifyIncoming();
    }

    // ───── incoming files ─────
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        try {
            if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
                uris.add(intent.getData());
            } else if (Intent.ACTION_SEND.equals(action)) {
                Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (p instanceof Uri) uris.add((Uri) p);
                else if (intent.getClipData() != null && intent.getClipData().getItemCount() > 0 && intent.getClipData().getItemAt(0).getUri() != null)
                    uris.add(intent.getClipData().getItemAt(0).getUri());
                else if (intent.getStringExtra(Intent.EXTRA_TEXT) != null) notice(tr("请分享书籍文件，而不是文字", "請分享書籍檔案，而不是文字", "Please share a book file, not text", "Partagez un fichier de livre, pas du texte"));
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Parcelable> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) for (Parcelable p : list) if (p instanceof Uri) uris.add((Uri) p);
            }
        } catch (Exception ignored) {}
        for (Uri uri : uris) {
            if (!"content".equals(uri.getScheme())) continue;
            String token = UUID.randomUUID().toString();
            incoming.put(token, uri);
            try {
                JSONObject o = new JSONObject();
                o.put("url", "https://" + HOST + "/assets/" + INCOMING + token);
                o.put("name", displayName(uri));
                pendingIncoming.add(o);
            } catch (Exception ignored) {}
        }
        // consume so a rotation/relaunch doesn't import twice
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {}
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "book";
        if (!name.contains(".")) {
            String type = getContentResolver().getType(uri);
            String ext = type == null ? null
                : type.equals("application/x-mobipocket-ebook") || type.equals("application/vnd.amazon.ebook") ? "mobi"
                : type.equals("application/vnd.amazon.mobi8-ebook") ? "azw3"
                : type.startsWith("application/x-fictionbook") ? "fb2"
                : type.equals("application/vnd.comicbook+zip") || type.equals("application/x-cbz") ? "cbz"
                : MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
            if (ext != null) name += "." + ext;
        }
        return name.replaceAll("[\\\\/\\p{Cntrl}]", "_");
    }

    private void notifyIncoming() {
        if (!pageReady || web == null || pendingIncoming.isEmpty()) return;
        web.evaluateJavascript("window.liubaiIncoming&&window.liubaiIncoming()", null);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private static WebResourceResponse empty(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse resource(Uri uri) {
        if (!isLocal(uri)) return empty(403, "Forbidden");
        String path = uri.getPath().substring("/assets/".length());
        if (path.isEmpty()) path = "index.html";
        if (path.contains("..") || path.contains("\\")) return empty(403, "Forbidden");
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        if (path.startsWith(INCOMING)) {
            Uri source = incoming.remove(path.substring(INCOMING.length()));
            if (source == null) return empty(404, "Not Found");
            try {
                InputStream in = getContentResolver().openInputStream(source);
                if (in == null) return empty(404, "Not Found");
                return new WebResourceResponse("application/octet-stream", null, 200, "OK", headers, in);
            } catch (Exception e) {
                return empty(404, "Not Found");
            }
        }
        try {
            String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (ext.equals("js") || ext.equals("mjs")) mime = "text/javascript";
            if (ext.equals("wasm")) mime = "application/wasm";
            if (ext.equals("woff2")) mime = "font/woff2";
            if (ext.equals("webmanifest")) mime = "application/manifest+json";
            if (ext.equals("bcmap") || mime == null) mime = "application/octet-stream";
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("www/" + path));
        } catch (IOException e) {
            return empty(404, "Not Found");
        }
    }

    // ───── window / insets ─────
    private void applyImmersiveMode() {
        if (root == null) return;
        Window w = getWindow();
        if (immersive) w.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        else w.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        WindowManager.LayoutParams a = w.getAttributes();
        a.layoutInDisplayCutoutMode = immersive
            ? (Build.VERSION.SDK_INT >= 30 ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES)
            : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
        w.setAttributes(a);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(darkBars ? 0 : light, light);
                if (immersive) c.hide(WindowInsets.Type.systemBars());
                else c.show(WindowInsets.Type.systemBars());
            }
        } else {
            root.setFitsSystemWindows(!immersive);
            int flags = darkBars ? 0 : (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            if (immersive) flags |= View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            w.getDecorView().setSystemUiVisibility(flags);
            if (immersive) root.setPadding(0, 0, 0, 0);
            WindowInsets ri = root.getRootWindowInsets();
            DisplayCutout cut = ri == null ? null : ri.getDisplayCutout();
            publishSafeArea(immersive && cut != null ? cut.getSafeInsetTop() : 0, immersive && cut != null ? cut.getSafeInsetBottom() : 0);
        }
        root.requestApplyInsets();
    }

    private void publishSafeArea(int top, int bottom) {
        if (web == null || (top == safeTop && bottom == safeBottom)) return;
        safeTop = top;
        safeBottom = bottom;
        float d = getResources().getDisplayMetrics().density;
        web.evaluateJavascript("window.liubaiSafeArea&&window.liubaiSafeArea(" + (top / d) + "," + (bottom / d) + ")", null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
            if (web != null) {
                web.removeCallbacks(restoreImmersive);
                web.postDelayed(restoreImmersive, 180);
            }
        }
    }

    // ───── brightness ─────
    private void applyBrightness(float value) {
        WindowManager.LayoutParams a = getWindow().getAttributes();
        a.screenBrightness = value;
        getWindow().setAttributes(a);
    }

    private void stopLightSensor() {
        if (lightRegistered && lightManager != null) lightManager.unregisterListener(lightListener);
        lightRegistered = false;
    }

    private void updateLightSensor() {
        if (brightnessMode != -2 || !resumed) {
            stopLightSensor();
            return;
        }
        if (lightRegistered) return;
        if (lightManager == null) {
            lightManager = (SensorManager) getSystemService(SENSOR_SERVICE);
            lightSensor = lightManager == null ? null : lightManager.getDefaultSensor(Sensor.TYPE_LIGHT);
        }
        if (lightSensor != null) lightRegistered = lightManager.registerListener(lightListener, lightSensor, SensorManager.SENSOR_DELAY_NORMAL);
        if (lightRegistered) return;
        brightnessMode = -1;
        applyBrightness(-1f);
        if (web != null) web.evaluateJavascript("window.liubaiBrightnessUnavailable&&window.liubaiBrightnessUnavailable()", null);
    }

    private void chooseBrightness(int mode, boolean night) {
        if (brightnessMode != mode || nightBrightness != night) {
            ambientLux = -1f;
            appliedBrightness = -1f;
            lastBrightnessUpdate = 0;
        }
        brightnessMode = mode;
        nightBrightness = night;
        updateLightSensor();
        if (brightnessMode != -2) applyBrightness(brightnessMode >= 0 ? Math.max(0.02f, Math.min(1f, brightnessMode / 100f)) : -1f);
    }

    // ───── misc ─────
    private void openExternal(Uri url) {
        String scheme = url.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (Exception e) {
            notice(tr("没有可用的浏览器", "沒有可用的瀏覽器", "No browser available", "Aucun navigateur disponible"));
        }
    }

    // UI language: set by the page (it may differ from the phone), else from the phone's locale
    private volatile String uiLang = null;
    private String lang() {
        if (uiLang != null) return uiLang;
        String tag = Locale.getDefault().toLanguageTag().toLowerCase(Locale.ROOT);
        if (tag.startsWith("zh")) return tag.contains("tw") || tag.contains("hk") || tag.contains("mo") || tag.contains("hant") ? "zh-TW" : "zh-CN";
        return tag.startsWith("fr") ? "fr" : "en";
    }
    private String tr(String zh, String tw, String en, String fr) {
        switch (lang()) {
            case "zh-TW": return tw;
            case "en": return en;
            case "fr": return fr;
            default: return zh;
        }
    }

    private void notice(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
    }

    private synchronized void discardExport() {
        try { if (exportStream != null) exportStream.close(); } catch (IOException ignored) {}
        if (exportFile != null) //noinspection ResultOfMethodCallIgnored
            exportFile.delete();
        exportFile = null;
        exportStream = null;
        exportToken = null;
        selectingDestination = false;
    }

    private void notifyExport(String message) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.liubaiExportResult&&window.liubaiExportResult(" + JSONObject.quote(message) + ")", null);
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (volumeKeys && web != null && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                int dir = code == KeyEvent.KEYCODE_VOLUME_DOWN ? 1 : -1;
                web.evaluateJavascript("window.liubaiVolumeKey?window.liubaiVolumeKey(" + dir + "):false", value -> {
                    // Not consumed by the reader (dialog/panel open): behave like a normal volume key.
                    if (!"true".equals(value)) {
                        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                        if (am != null) am.adjustSuggestedStreamVolume(dir > 0 ? AudioManager.ADJUST_LOWER : AudioManager.ADJUST_RAISE,
                            AudioManager.USE_DEFAULT_STREAM_TYPE, AudioManager.FLAG_SHOW_UI);
                    }
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    public final class Bridge {
        @JavascriptInterface public String version() { return "2.2.0"; }

        @JavascriptInterface public void setLanguage(String code) {
            if ("zh-CN".equals(code) || "zh-TW".equals(code) || "en".equals(code) || "fr".equals(code)) uiLang = code;
        }

        @JavascriptInterface public void setImmersive(boolean on) {
            runOnUiThread(() -> {
                immersive = on;
                applyImmersiveMode();
                if (web != null) {
                    web.removeCallbacks(restoreImmersive);
                    web.postDelayed(restoreImmersive, 180);
                }
            });
        }

        @JavascriptInterface public void setAppearance(String color, boolean dark) {
            runOnUiThread(() -> {
                if (web == null) return;
                try {
                    int c = Color.parseColor(color);
                    darkBars = dark;
                    root.setBackgroundColor(c);
                    web.setBackgroundColor(c);
                    getWindow().setBackgroundDrawable(new ColorDrawable(c));
                    getWindow().setStatusBarColor(c);
                    getWindow().setNavigationBarColor(c);
                    if (Build.VERSION.SDK_INT >= 29) {
                        getWindow().setStatusBarContrastEnforced(false);
                        getWindow().setNavigationBarContrastEnforced(false);
                    }
                    if (Build.VERSION.SDK_INT < 30) {
                        applyImmersiveMode();
                    } else {
                        WindowInsetsController ic = getWindow().getInsetsController();
                        int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                        if (ic != null) ic.setSystemBarsAppearance(dark ? 0 : light, light);
                    }
                } catch (IllegalArgumentException ignored) {}
            });
        }

        @JavascriptInterface public void setBrightness(int value) {
            runOnUiThread(() -> chooseBrightness(value, darkBars));
        }

        @JavascriptInterface public void setBrightnessMode(int value, boolean night) {
            runOnUiThread(() -> chooseBrightness(value, night));
        }

        @JavascriptInterface public void setKeepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface public void setVolumeKeys(boolean on) { volumeKeys = on; }

        @JavascriptInterface public int battery() {
            try {
                BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
                int v = bm == null ? -1 : bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                if (v > 0 && v <= 100) return v;
                Intent i = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (i == null) return -1;
                int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                return level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : -1;
            } catch (Exception e) {
                return -1;
            }
        }

        @JavascriptInterface public void shareText(String text) {
            runOnUiThread(() -> {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(send, tr("分享摘录", "分享摘錄", "Share quote", "Partager la citation")));
                } catch (Exception e) {
                    notice(tr("没有可分享的应用", "沒有可分享的 App", "No app to share with", "Aucune app pour partager"));
                }
            });
        }

        // Copy without relying on the page's clipboard permission.
        @JavascriptInterface public void copyText(String text) {
            runOnUiThread(() -> {
                try {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText(tr("摘录", "摘錄", "Quote", "Citation"), text));
                } catch (Exception ignored) {}
            });
        }

        // 查词: hand the words to the phone's dictionary / translation apps (PROCESS_TEXT).
        @JavascriptInterface public boolean processText(String text) {
            try {
                Intent i = new Intent(Intent.ACTION_PROCESS_TEXT).setType("text/plain")
                    .putExtra(Intent.EXTRA_PROCESS_TEXT, text)
                    .putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
                if (getPackageManager().queryIntentActivities(i, 0).isEmpty()) return false;
                runOnUiThread(() -> {
                    try {
                        startActivity(i);
                    } catch (Exception e) {
                        notice(tr("没有可以查词的应用", "沒有可以查字的 App", "No dictionary app found", "Aucune app de dictionnaire"));
                    }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        // 关于留白 → 邮箱: open the mail app with the address filled in
        @JavascriptInterface public boolean email(String to, String subject) {
            try {
                Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + Uri.encode(to)))
                    .putExtra(Intent.EXTRA_EMAIL, new String[]{to})
                    .putExtra(Intent.EXTRA_SUBJECT, subject);
                if (i.resolveActivity(getPackageManager()) == null) return false;
                runOnUiThread(() -> {
                    try { startActivity(i); } catch (Exception e) { notice(tr("没有找到邮件应用", "沒有找到郵件 App", "No email app found", "Aucune app de messagerie")); }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        // 关于留白 → 微信: WeChat can't open a profile by ID, so just bring it up
        @JavascriptInterface public boolean openWeChat() {
            try {
                Intent i = getPackageManager().getLaunchIntentForPackage("com.tencent.mm");
                if (i == null) return false;
                runOnUiThread(() -> {
                    try { startActivity(i); } catch (Exception e) { notice(tr("没有找到微信", "沒有找到微信", "WeChat isn't installed", "WeChat n’est pas installé")); }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        // 0 = follow the phone, 1 = portrait, 2 = landscape (either way up)
        @JavascriptInterface public void setOrientation(int mode) {
            runOnUiThread(() -> setRequestedOrientation(mode == 1 ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
                : mode == 2 ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
        }

        @JavascriptInterface public void openExternal(String url) {
            runOnUiThread(() -> MainActivity.this.openExternal(Uri.parse(url)));
        }

        // Minimal HTTP for WebDAV sync (the page itself can't reach other origins because of CORS).
        @JavascriptInterface public void http(String id, String method, String url, String headers, String body) {
            new Thread(() -> {
                int code = -1;
                String text = "";
                HttpURLConnection c = null;
                try {
                    URL u = new URL(url);
                    if (!"https".equals(u.getProtocol()) && !"http".equals(u.getProtocol())) throw new IOException("bad scheme");
                    if (!method.matches("GET|PUT|DELETE|HEAD")) throw new IOException("bad method");
                    c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setUseCaches(false);
                    c.setInstanceFollowRedirects(true);
                    c.setRequestMethod(method);
                    JSONObject h = new JSONObject(headers == null || headers.isEmpty() ? "{}" : headers);
                    for (Iterator<String> it = h.keys(); it.hasNext(); ) {
                        String k = it.next();
                        c.setRequestProperty(k, h.getString(k));
                    }
                    if ("PUT".equals(method)) {
                        byte[] data = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
                        c.setDoOutput(true);
                        c.setFixedLengthStreamingMode(data.length);
                        try (OutputStream out = c.getOutputStream()) { out.write(data); }
                    }
                    code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) {
                        try (InputStream src = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                            byte[] chunk = new byte[16384];
                            int n, total = 0;
                            while ((n = src.read(chunk)) != -1) {
                                total += n;
                                if (total > 30 * 1024 * 1024) throw new IOException("response too large");
                                buf.write(chunk, 0, n);
                            }
                            text = buf.toString("UTF-8");
                        }
                    }
                } catch (Exception e) {
                    if (code < 0) text = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                final int fc = code;
                final String ft = text;
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript("window.liubaiHttp&&window.liubaiHttp(" + JSONObject.quote(id) + "," + fc + "," + JSONObject.quote(ft) + ")", null);
                });
            }, "liubai-http").start();
        }

        @JavascriptInterface public String takeIncoming() {
            JSONArray out = new JSONArray();
            synchronized (pendingIncoming) {
                for (JSONObject o : pendingIncoming) out.put(o);
                pendingIncoming.clear();
            }
            return out.toString();
        }

        @JavascriptInterface public String beginExport(String name, String mime) {
            synchronized (MainActivity.this) {
                if (exportToken != null) return "";
                try {
                    exportToken = UUID.randomUUID().toString();
                    exportFile = File.createTempFile("liubai-export-", ".tmp", getCacheDir());
                    exportStream = new FileOutputStream(exportFile);
                    exportName = name.replaceAll("[\\\\/\\p{Cntrl}]", "_");
                    if (exportName.length() > 180) exportName = exportName.substring(0, 180);
                    exportMime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
                    return exportToken;
                } catch (Exception e) {
                    discardExport();
                    return "";
                }
            }
        }

        @JavascriptInterface public boolean appendExport(String token, String data) {
            synchronized (MainActivity.this) {
                if (exportToken == null || !exportToken.equals(token) || selectingDestination || data.length() > 1500000) return false;
                try {
                    exportStream.write(Base64.decode(data, Base64.NO_WRAP));
                    return true;
                } catch (Exception e) {
                    discardExport();
                    return false;
                }
            }
        }

        @JavascriptInterface public void cancelExport(String token) {
            synchronized (MainActivity.this) {
                if (token.equals(exportToken) && !selectingDestination) discardExport();
            }
        }

        @JavascriptInterface public boolean finishExport(String token) {
            synchronized (MainActivity.this) {
                if (exportToken == null || !exportToken.equals(token) || selectingDestination) return false;
                try {
                    exportStream.close();
                    exportStream = null;
                    selectingDestination = true;
                    runOnUiThread(() -> {
                        try {
                            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                            i.addCategory(Intent.CATEGORY_OPENABLE);
                            i.setType(exportMime);
                            i.putExtra(Intent.EXTRA_TITLE, exportName);
                            startActivityForResult(i, SAVE_FILE);
                        } catch (Exception e) {
                            discardExport();
                            notice(tr("无法打开保存窗口", "無法開啟儲存視窗", "Can't open the save dialog", "Impossible d’ouvrir la fenêtre d’enregistrement"));
                        }
                    });
                    return true;
                } catch (IOException e) {
                    discardExport();
                    return false;
                }
            }
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_BOOK && chooser != null) {
            ArrayList<Uri> list = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) list.add(data.getClipData().getItemAt(i).getUri());
                } else if (data.getData() != null) list.add(data.getData());
            }
            chooser.onReceiveValue(list.isEmpty() ? null : list.toArray(new Uri[0]));
            chooser = null;
        }
        if (request == SAVE_FILE) {
            if (result != RESULT_OK || data == null || data.getData() == null) {
                discardExport();
                notifyExport(tr("已取消保存", "已取消儲存", "Save canceled", "Enregistrement annulé"));
                return;
            }
            final Uri target = data.getData();
            final File source = exportFile;
            new Thread(() -> {
                String message;
                try (FileInputStream in = new FileInputStream(source);
                     OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
                    if (out == null) throw new IOException("target unavailable");
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    out.flush();
                    message = tr("文件已保存", "檔案已儲存", "File saved", "Fichier enregistré");
                } catch (Exception e) {
                    message = tr("保存失败，请重新导出", "儲存失敗，請重新匯出", "Couldn't save. Please export again.", "Échec de l’enregistrement, exportez à nouveau.");
                }
                discardExport();
                notifyExport(message);
            }, "liubai-export").start();
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("window.liubaiBack?window.liubaiBack():false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onPause() {
        resumed = false;
        stopLightSensor();
        if (web != null) {
            web.evaluateJavascript("document.dispatchEvent(new Event('liubai-save'))", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        updateLightSensor();
        if (web != null) {
            web.onResume();
            applyImmersiveMode();
        }
    }

    @Override
    protected void onDestroy() {
        stopLightSensor();
        if (chooser != null) chooser.onReceiveValue(null);
        discardExport();
        if (web != null) {
            web.removeCallbacks(restoreImmersive);
            web.removeJavascriptInterface("LiubaiAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // The reader shows its own selection menu (划线 / 笔记 / 复制 / 查词 / 分享), so the
    // system's floating copy toolbar is kept empty instead of stacking a second menu.
    static class ReaderWebView extends WebView {
        ReaderWebView(Context c) { super(c); }
        @Override public ActionMode startActionMode(ActionMode.Callback callback, int type) {
            return super.startActionMode(new QuietCallback(callback), type);
        }
        @Override public ActionMode startActionMode(ActionMode.Callback callback) {
            return super.startActionMode(new QuietCallback(callback));
        }
    }
    static class QuietCallback extends ActionMode.Callback2 {
        private final ActionMode.Callback base;
        QuietCallback(ActionMode.Callback base) { this.base = base; }
        @Override public boolean onCreateActionMode(ActionMode mode, Menu menu) {
            boolean ok = base.onCreateActionMode(mode, menu);
            menu.clear();
            return ok;
        }
        @Override public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
            boolean ok = base.onPrepareActionMode(mode, menu);
            menu.clear();
            return ok;
        }
        @Override public boolean onActionItemClicked(ActionMode mode, MenuItem item) { return base.onActionItemClicked(mode, item); }
        @Override public void onDestroyActionMode(ActionMode mode) { base.onDestroyActionMode(mode); }
        @Override public void onGetContentRect(ActionMode mode, View view, Rect outRect) {
            if (base instanceof ActionMode.Callback2) ((ActionMode.Callback2) base).onGetContentRect(mode, view, outRect);
            else super.onGetContentRect(mode, view, outRect);
        }
    }
}
