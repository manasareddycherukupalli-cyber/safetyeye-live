package com.safetyeye.app

import android.graphics.Bitmap

interface SafetyDetector {
    fun analyze(frame: Bitmap): List<Detection>
    fun close() = Unit
}

class PlaceholderSafetyDetector : SafetyDetector {
    override fun analyze(frame: Bitmap): List<Detection> {
        return emptyList()
    }
}
