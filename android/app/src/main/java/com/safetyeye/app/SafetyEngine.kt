package com.safetyeye.app

import android.graphics.RectF

class SafetyEngine {
    var dangerZone = RectF(0.18f, 0.58f, 0.82f, 0.9f)
        private set
    var exitZone = RectF(0.08f, 0.08f, 0.34f, 0.24f)
        private set
    var occupancyLimit = 1
    var dangerZoneEnabled = true
    var exitZoneEnabled = false

    fun updateDangerZone(zone: RectF) {
        dangerZone = RectF(
            zone.left.coerceIn(0f, 1f),
            zone.top.coerceIn(0f, 1f),
            zone.right.coerceIn(0f, 1f),
            zone.bottom.coerceIn(0f, 1f),
        )
    }

    fun updateExitZone(zone: RectF) {
        exitZone = RectF(
            zone.left.coerceIn(0f, 1f),
            zone.top.coerceIn(0f, 1f),
            zone.right.coerceIn(0f, 1f),
            zone.bottom.coerceIn(0f, 1f),
        )
    }

    fun activeRuleCount(): Int {
        return listOf(dangerZoneEnabled, exitZoneEnabled, occupancyLimit > 0).count { it }
    }

    fun evaluate(detections: List<Detection>): List<Incident> {
        val now = System.currentTimeMillis()
        val events = mutableListOf<Incident>()
        val people = detections.filter { it.label.equals("person", ignoreCase = true) }

        if (dangerZoneEnabled) {
            people
                .filter { RectF.intersects(it.bounds, dangerZone) }
                .forEach {
                    events += Incident(
                        timestampMs = now,
                        message = "Step back from the danger zone.",
                        status = IncidentStatus.BREACH,
                        zone = "restricted",
                    )
                }
        }

        if (exitZoneEnabled) {
            detections
                .filter { RectF.intersects(it.bounds, exitZone) }
                .forEach {
                    events += Incident(
                        timestampMs = now,
                        message = "Keep the exit clear.",
                        status = IncidentStatus.BREACH,
                        zone = "exit",
                    )
                }
        }

        if (people.size > occupancyLimit) {
            events += Incident(
                timestampMs = now,
                message = "Occupancy limit exceeded.",
                status = IncidentStatus.WARNING,
                zone = "occupancy",
            )
        }

        return events
    }
}
