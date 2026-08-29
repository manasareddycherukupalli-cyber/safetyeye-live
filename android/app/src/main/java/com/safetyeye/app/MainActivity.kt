package com.safetyeye.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
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
        }

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
