package com.safetyeye.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.ViewGroup
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

        setContentView(webView)
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION)
        }
        webView.loadUrl("file:///android_asset/index.html")
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
