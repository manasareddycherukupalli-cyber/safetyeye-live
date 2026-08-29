package com.safetyeye.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowInsets
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
            setBackgroundColor(android.graphics.Color.rgb(10, 13, 17))
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    // Insets usually arrive before the page is ready to receive them,
                    // so replay the last measurement once the document exists.
                    applyInsets(lastInsets)
                }
            }
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

        setContentView(webView)

        // targetSdk 35+ draws edge-to-edge, so the WebView fills the display and the
        // page renders under the status bar and the gesture pill. CSS env(safe-area-inset-*)
        // is not populated in an Android WebView, so the real insets are measured here
        // and handed to the page as custom properties instead.
        webView.setOnApplyWindowInsetsListener { _, insets ->
            lastInsets = insetsToCss(insets)
            applyInsets(lastInsets)
            insets
        }

        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION)
        }
        webView.loadUrl("file:///android_asset/index.html")
    }

    private var lastInsets: String? = null

    private fun insetsToCss(insets: WindowInsets): String {
        val d = resources.displayMetrics.density
        val top: Int
        val bottom: Int
        val left: Int
        val right: Int
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            top = bars.top; bottom = bars.bottom; left = bars.left; right = bars.right
        } else {
            @Suppress("DEPRECATION")
            run {
                top = insets.systemWindowInsetTop
                bottom = insets.systemWindowInsetBottom
                left = insets.systemWindowInsetLeft
                right = insets.systemWindowInsetRight
            }
        }
        // CSS pixels, not physical pixels — divide by density.
        return "${top / d}px,${bottom / d}px,${left / d}px,${right / d}px"
    }

    private fun applyInsets(css: String?) {
        val parts = css?.split(",") ?: return
        if (parts.size != 4) return
        webView.evaluateJavascript(
            """
            (function(){
              var r = document.documentElement.style;
              r.setProperty('--sat','${parts[0]}');
              r.setProperty('--sab','${parts[1]}');
              r.setProperty('--sal','${parts[2]}');
              r.setProperty('--sar','${parts[3]}');
            })();
            """.trimIndent(),
            null,
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
        private const val CAMERA_PERMISSION = 11
        private const val WEB_PERMISSION_REQUEST = 12
    }
}
