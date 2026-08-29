package com.safetyeye.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.Bundle
import android.provider.MediaStore
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(SHELL_BACKGROUND)
            webViewClient = WebViewClient()
            webChromeClient = object : WebChromeClient() {
                // The page is the whole app, so its console is the only place a failure
                // in it shows up. Without this it fails invisibly on the device.
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.d(TAG, "web: ${m.message()} (line ${m.lineNumber()})")
                    return true
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        val needsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                        val needsMic = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                        val missingCamera = needsCamera && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                        val missingMic = needsMic && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED

                        if (missingCamera || missingMic) {
                            pendingPermissionRequest = request
                            requestPermissions(
                                arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO),
                                WEB_PERMISSION_REQUEST,
                            )
                        } else {
                            request.grant(request.resources)
                        }
                    }
                }
            }
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            settings.loadWithOverviewMode = false
            settings.useWideViewPort = false
            settings.textZoom = 100
            addJavascriptInterface(FileBridge(), "SafetyEyeFiles")
            addJavascriptInterface(SpeechBridge(), "SafetyEyeVoice")
        }

        startTts()

        // targetSdk 35+ draws edge-to-edge: the window fills the whole display, so the
        // page would render under the status bar, the punch-hole camera and the gesture
        // pill. The page cannot pad itself out of the way — CSS env(safe-area-inset-*)
        // reads 0 in an Android WebView — so the real insets are measured here.
        //
        // They are applied to a frame around the WebView rather than to the WebView.
        // Two earlier attempts failed silently on the device: handing the numbers to the
        // page as CSS custom properties, and padding the WebView itself, which does not
        // inset what Chromium draws. Padding an ordinary ViewGroup moves its child, and
        // there is no version of that which quietly does nothing.
        val frame = FrameLayout(this).apply {
            setBackgroundColor(SHELL_BACKGROUND)
            addView(webView)
        }
        setContentView(frame)

        frame.setOnApplyWindowInsetsListener { v, insets ->
            val bars = systemBarsOf(insets)
            v.setPadding(bars[0], bars[1], bars[2], bars[3])
            Log.d(TAG, "window insets l=${bars[0]} t=${bars[1]} r=${bars[2]} b=${bars[3]}")
            insets
        }
        // The first dispatch can land before the listener is attached; ask for another.
        frame.requestApplyInsets()

        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION)
        }
        webView.loadUrl("file:///android_asset/index.html")
    }

    // Spoken warnings. The page asks for these through window.speechSynthesis, which is
    // the right API everywhere except here: Android's WebView has no speech engine behind
    // it. The object exists, speak() reports no error, and nothing is ever said — which is
    // why the alert beeps came through on the device and the words did not. The platform
    // engine is wired to the page instead, and the page falls back to the Web Speech API
    // when this bridge is absent (a normal browser, the PWA).
    private var tts: TextToSpeech? = null

    @Volatile private var ttsReady = false

    // A breach can fire before the engine finishes starting, and a warning that arrives
    // late is worse than useless. Hold the most recent line and speak it on ready.
    @Volatile private var pendingSpeech: String? = null

    private fun startTts() {
        tts = TextToSpeech(this) { status ->
            if (status != TextToSpeech.SUCCESS) {
                Log.w(TAG, "no text-to-speech engine available; warnings will be beeps only")
                return@TextToSpeech
            }
            val engine = tts ?: return@TextToSpeech
            // Site language first, then any English, then whatever the phone is set to.
            val wanted = listOf(Locale("en", "IN"), Locale.US, Locale.getDefault())
            for (locale in wanted) {
                val result = engine.setLanguage(locale)
                if (result != TextToSpeech.LANG_MISSING_DATA &&
                    result != TextToSpeech.LANG_NOT_SUPPORTED
                ) {
                    Log.d(TAG, "text-to-speech ready in $locale")
                    break
                }
            }
            ttsReady = true
            pendingSpeech?.let { speakNow(it) }
            pendingSpeech = null
        }
    }

    private fun speakNow(text: String) {
        // QUEUE_FLUSH, never QUEUE_ADD: if a breach follows a warning, the breach must
        // interrupt it. Announcing a warning after the crossing it failed to prevent is
        // the one thing this must not do.
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "safetyeye")
    }

    private inner class SpeechBridge {
        /** True once an engine is loaded, so the page can decide whether to fall back. */
        @JavascriptInterface
        fun ready(): Boolean = ttsReady

        @JavascriptInterface
        fun speak(text: String) {
            if (text.isBlank()) return
            // Logged because a silent phone gives no clue which half is at fault: the
            // page not asking, or the engine not speaking. This line separates them.
            Log.d(TAG, "speak(ready=$ttsReady): $text")
            if (ttsReady) speakNow(text) else pendingSpeech = text
        }

        @JavascriptInterface
        fun stop() {
            pendingSpeech = null
            tts?.stop()
        }
    }

    // The page builds the .docx and the .csv itself and used to hand them to an
    // <a download>. A WebView drops that click on the floor: nothing was written, and
    // the page announced "saved" regardless. The bytes now come across in chunks and
    // are written here, and the page only claims success once this hands back a real
    // path. Chunked because a whole report crosses the bridge as a string, and one
    // several-megabyte argument is where that starts to go wrong.
    private inner class FileBridge {
        private var buffer: ByteArrayOutputStream? = null

        @JavascriptInterface
        fun begin() {
            buffer = ByteArrayOutputStream()
        }

        @JavascriptInterface
        fun write(chunk: String) {
            buffer?.write(Base64.decode(chunk, Base64.DEFAULT))
        }

        /** Returns where the file landed, or "" if it did not. */
        @JavascriptInterface
        fun finish(name: String, mime: String): String {
            val bytes = buffer?.toByteArray() ?: return ""
            buffer = null
            return try {
                saveToDownloads(name, mime, bytes)
            } catch (e: Exception) {
                Log.e(TAG, "could not save $name", e)
                ""
            }
        }
    }

    private fun saveToDownloads(name: String, mime: String, bytes: ByteArray): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = contentResolver
            val pending = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, pending)
                ?: return ""
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return ""
            // Until IS_PENDING is cleared the file is invisible to every other app —
            // which is indistinguishable, to the supervisor, from not having saved it.
            resolver.update(
                uri,
                ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) },
                null,
                null,
            )
            Log.d(TAG, "saved $name (${bytes.size} bytes) to Downloads")
            return "Downloads/$name"
        }
        // Before Android 10 the public folder needs a storage permission this app never
        // asks for, so the file goes somewhere it is allowed to write unprompted.
        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return ""
        dir.mkdirs()
        File(dir, name).writeBytes(bytes)
        Log.d(TAG, "saved $name (${bytes.size} bytes) to ${dir.absolutePath}")
        return dir.absolutePath + "/" + name
    }

    // left, top, right, bottom in physical pixels. The cutout is folded in with the
    // system bars so a punch-hole or an island is cleared even where the status bar is
    // shorter than it is.
    private fun systemBarsOf(insets: WindowInsets): IntArray =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bars = insets.getInsets(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )
            intArrayOf(bars.left, bars.top, bars.right, bars.bottom)
        } else {
            @Suppress("DEPRECATION")
            intArrayOf(
                insets.systemWindowInsetLeft,
                insets.systemWindowInsetTop,
                insets.systemWindowInsetRight,
                insets.systemWindowInsetBottom,
            )
        }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == WEB_PERMISSION_REQUEST) {
            val request = pendingPermissionRequest ?: return
            pendingPermissionRequest = null
            if (grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
                request.grant(request.resources)
            } else {
                request.deny()
            }
        }
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        pendingPermissionRequest?.deny()
        tts?.stop()
        tts?.shutdown()
        tts = null
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "SafetyEye"

        // --bg from the page, so the bars sit on the same ground as the app
        private const val SHELL_BACKGROUND = 0xFF0A0D11.toInt()
        private const val CAMERA_PERMISSION = 11
        private const val WEB_PERMISSION_REQUEST = 12
    }
}
