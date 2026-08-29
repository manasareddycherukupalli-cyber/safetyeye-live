package com.safetyeye.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View

class DetectionOverlayView(context: Context) : View(context) {
    private val zonePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(70, 216, 74, 58)
        style = Paint.Style.FILL
    }
    private val zoneStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(216, 74, 58)
        strokeWidth = 5f
        style = Paint.Style.STROKE
    }
    private val detectionPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(31, 157, 99)
        strokeWidth = 5f
        style = Paint.Style.STROKE
    }
    private val exitPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(55, 77, 163, 255)
        style = Paint.Style.FILL
    }
    private val exitStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(77, 163, 255)
        strokeWidth = 5f
        style = Paint.Style.STROKE
    }
    private val dragPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(255, 184, 77)
        strokeWidth = 5f
        style = Paint.Style.STROKE
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 36f
        setShadowLayer(5f, 0f, 2f, Color.BLACK)
    }

    var dangerZone: RectF = RectF(0.18f, 0.58f, 0.82f, 0.9f)
        set(value) {
            field = value
            invalidate()
        }
    var exitZone: RectF = RectF(0.08f, 0.08f, 0.34f, 0.24f)
        set(value) {
            field = value
            invalidate()
        }
    var exitZoneVisible: Boolean = false
        set(value) {
            field = value
            invalidate()
        }
    var drawMode: DrawMode = DrawMode.NONE
    var onZoneDrawn: ((DrawMode, RectF) -> Unit)? = null

    var detections: List<Detection> = emptyList()
        set(value) {
            field = value
            invalidate()
        }
    private var dragStartX = 0f
    private var dragStartY = 0f
    private var dragRect: RectF? = null

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val zone = scale(dangerZone)
        canvas.drawRect(zone, zonePaint)
        canvas.drawRect(zone, zoneStrokePaint)
        canvas.drawText("Danger zone", zone.left + 14f, zone.top + 42f, textPaint)

        if (exitZoneVisible) {
            val exit = scale(exitZone)
            canvas.drawRect(exit, exitPaint)
            canvas.drawRect(exit, exitStrokePaint)
            canvas.drawText("Exit", exit.left + 14f, exit.top + 42f, textPaint)
        }

        detections.forEach { detection ->
            val rect = scale(detection.bounds)
            canvas.drawRect(rect, detectionPaint)
            canvas.drawText(
                "${detection.label} ${(detection.confidence * 100).toInt()}%",
                rect.left + 10f,
                (rect.top - 12f).coerceAtLeast(42f),
                textPaint,
            )
        }

        dragRect?.let { canvas.drawRect(it, dragPaint) }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (drawMode == DrawMode.NONE) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                dragStartX = event.x
                dragStartY = event.y
                dragRect = RectF(event.x, event.y, event.x, event.y)
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                dragRect = RectF(
                    minOf(dragStartX, event.x),
                    minOf(dragStartY, event.y),
                    maxOf(dragStartX, event.x),
                    maxOf(dragStartY, event.y),
                )
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP -> {
                val rect = dragRect
                dragRect = null
                if (rect != null && rect.width() > 30f && rect.height() > 30f) {
                    onZoneDrawn?.invoke(drawMode, normalize(rect))
                }
                drawMode = DrawMode.NONE
                invalidate()
                return true
            }
        }
        return true
    }

    private fun scale(rect: RectF): RectF {
        return RectF(
            rect.left * width,
            rect.top * height,
            rect.right * width,
            rect.bottom * height,
        )
    }

    private fun normalize(rect: RectF): RectF {
        return RectF(
            (rect.left / width).coerceIn(0f, 1f),
            (rect.top / height).coerceIn(0f, 1f),
            (rect.right / width).coerceIn(0f, 1f),
            (rect.bottom / height).coerceIn(0f, 1f),
        )
    }

    enum class DrawMode {
        NONE,
        DANGER,
        EXIT,
    }
}
