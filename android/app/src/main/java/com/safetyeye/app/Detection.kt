package com.safetyeye.app

import android.graphics.RectF

data class Detection(
    val label: String,
    val confidence: Float,
    val bounds: RectF,
)

data class Incident(
    val timestampMs: Long,
    val message: String,
    val status: IncidentStatus = IncidentStatus.BREACH,
    val zone: String = "restricted",
)

enum class IncidentStatus {
    WARNING,
    BREACH,
}

data class ShiftSummary(
    val warnings: Int,
    val breaches: Int,
    val prevented: Int,
    val preventedPct: Int,
)
