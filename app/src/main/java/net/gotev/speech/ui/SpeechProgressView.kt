package net.gotev.speech.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

class SpeechBar(
    var x: Int,
    var y: Int,
    var height: Int,
    val maxHeight: Int,
    val radius: Int
) {
    val startX: Int = x
    val startY: Int = y
    val rect: RectF = RectF(
        (x - radius).toFloat(),
        (y - height / 2).toFloat(),
        (x + radius).toFloat(),
        (y + height / 2).toFloat()
    )

    fun update() {
        rect.set(
            (x - radius).toFloat(),
            (y - height / 2).toFloat(),
            (x + radius).toFloat(),
            (y + height / 2).toFloat()
        )
    }
}

private interface BarParamsAnimator {
    fun start()
    fun stop()
    fun animate()
}

private class IdleAnimator(
    private val bars: List<SpeechBar>,
    private val floatingAmplitude: Int
) : BarParamsAnimator {
    private var startTimestamp: Long = 0L
    private var isPlaying: Boolean = false

    override fun start() {
        isPlaying = true
        startTimestamp = SystemClock.uptimeMillis()
    }

    override fun stop() {
        isPlaying = false
    }

    override fun animate() {
        if (!isPlaying) return
        val currTimestamp = SystemClock.uptimeMillis()
        if (currTimestamp - startTimestamp > IDLE_DURATION) {
            startTimestamp += IDLE_DURATION
        }
        val delta = currTimestamp - startTimestamp
        for (i in bars.indices) {
            val bar = bars[i]
            val angle = (delta.toFloat() / IDLE_DURATION) * 360f + 120f * i
            bar.y = (sin(Math.toRadians(angle.toDouble())) * floatingAmplitude).toInt() + bar.startY
            bar.update()
        }
    }

    companion object {
        private const val IDLE_DURATION = 1500L
    }
}

private class BarRmsAnimator(private val bar: SpeechBar) : BarParamsAnimator {
    private var fromHeightPart = 0f
    private var toHeightPart = 0f
    private var startTimestamp = 0L
    private var isPlaying = false
    private var isUpAnimation = false

    override fun start() {
        isPlaying = true
    }

    override fun stop() {
        isPlaying = false
    }

    override fun animate() {
        if (!isPlaying) return
        val delta = SystemClock.uptimeMillis() - startTimestamp
        if (isUpAnimation) animateUp(delta) else animateDown(delta)
    }

    fun onRmsChanged(rmsdB: Float) {
        val newHeightPart = when {
            rmsdB < QUIT_RMSDB_MAX -> 0.2f
            rmsdB <= MEDIUM_RMSDB_MAX -> (0.3f + Random.nextFloat()).coerceAtMost(0.6f)
            else -> (0.7f + Random.nextFloat()).coerceAtMost(1f)
        }

        if (bar.height.toFloat() / bar.maxHeight > newHeightPart) return

        fromHeightPart = bar.height.toFloat() / bar.maxHeight
        toHeightPart = newHeightPart
        startTimestamp = SystemClock.uptimeMillis()
        isUpAnimation = true
        isPlaying = true
    }

    private fun animateUp(delta: Long) {
        var finished = false
        val minHeight = (fromHeightPart * bar.maxHeight).toInt()
        val toHeight = (bar.maxHeight * toHeightPart).toInt()
        val timePart = (delta.toFloat() / BAR_ANIMATION_UP_DURATION).coerceIn(0f, 1f)

        var height = minHeight + (ACCEL_INTERPOLATOR.getInterpolation(timePart) * (toHeight - minHeight)).toInt()
        if (height < bar.height) return
        if (height >= toHeight) {
            height = toHeight
            finished = true
        }
        bar.height = height
        bar.update()

        if (finished) {
            isUpAnimation = false
            startTimestamp = SystemClock.uptimeMillis()
        }
    }

    private fun animateDown(delta: Long) {
        val minHeight = bar.radius * 2
        val fromHeight = (bar.maxHeight * toHeightPart).toInt()
        val timePart = (delta.toFloat() / BAR_ANIMATION_DOWN_DURATION).coerceIn(0f, 1f)

        val height = minHeight + ((1f - DECEL_INTERPOLATOR.getInterpolation(timePart)) * (fromHeight - minHeight)).toInt()
        if (height > bar.height) return
        if (height <= minHeight) {
            bar.height = minHeight
            bar.update()
            isPlaying = false
            return
        }
        bar.height = height
        bar.update()
    }

    companion object {
        private const val QUIT_RMSDB_MAX = 2f
        private const val MEDIUM_RMSDB_MAX = 5.5f
        private const val BAR_ANIMATION_UP_DURATION = 130L
        private const val BAR_ANIMATION_DOWN_DURATION = 500L
        private val ACCEL_INTERPOLATOR = AccelerateInterpolator()
        private val DECEL_INTERPOLATOR = DecelerateInterpolator()
    }
}

private class RmsAnimator(speechBars: List<SpeechBar>) : BarParamsAnimator {
    private val barAnimators = speechBars.map { BarRmsAnimator(it) }

    override fun start() = barAnimators.forEach { it.start() }
    override fun stop() = barAnimators.forEach { it.stop() }
    override fun animate() = barAnimators.forEach { it.animate() }
    fun onRmsChanged(rmsDB: Float) = barAnimators.forEach { it.onRmsChanged(rmsDB) }
}

private class TransformAnimator(
    private val bars: List<SpeechBar>,
    private val centerX: Int,
    private val centerY: Int,
    private val radius: Int,
    private val onFinished: () -> Unit
) : BarParamsAnimator {
    private var startTimestamp = 0L
    private var isPlaying = false
    private val finalPositions = ArrayList<Point>(SpeechProgressView.BARS_COUNT)

    override fun start() {
        isPlaying = true
        startTimestamp = SystemClock.uptimeMillis()
        finalPositions.clear()
        for (i in 0 until SpeechProgressView.BARS_COUNT) {
            val point = Point(centerX, centerY - radius)
            rotate((360.0 / SpeechProgressView.BARS_COUNT) * i, point)
            finalPositions.add(point)
        }
    }

    override fun stop() {
        if (isPlaying) {
            isPlaying = false
            onFinished()
        }
    }

    override fun animate() {
        if (!isPlaying) return
        val delta = (SystemClock.uptimeMillis() - startTimestamp).coerceAtMost(DURATION)
        val fraction = delta.toFloat() / DURATION
        for (i in bars.indices) {
            val bar = bars[i]
            val target = finalPositions[i]
            bar.x = bar.startX + ((target.x - bar.startX) * fraction).toInt()
            bar.y = bar.startY + ((target.y - bar.startY) * fraction).toInt()
            bar.update()
        }
        if (delta == DURATION) {
            stop()
        }
    }

    private fun rotate(degrees: Double, point: Point) {
        val angle = Math.toRadians(degrees)
        val cosA = cos(angle)
        val sinA = sin(angle)
        val dx = point.x - centerX
        val dy = point.y - centerY
        point.x = centerX + (dx * cosA - dy * sinA).toInt()
        point.y = centerY + (dx * sinA + dy * cosA).toInt()
    }

    companion object {
        private const val DURATION = 300L
    }
}

private class RotatingAnimator(
    private val bars: List<SpeechBar>,
    private val centerX: Int,
    private val centerY: Int
) : BarParamsAnimator {
    private var startTimestamp = 0L
    private var isPlaying = false
    private val startPositions = bars.map { Point(it.x, it.y) }

    override fun start() {
        isPlaying = true
        startTimestamp = SystemClock.uptimeMillis()
    }

    override fun stop() {
        isPlaying = false
    }

    override fun animate() {
        if (!isPlaying) return
        val currTimestamp = SystemClock.uptimeMillis()
        if (currTimestamp - startTimestamp > DURATION) {
            startTimestamp += DURATION
        }
        val delta = currTimestamp - startTimestamp
        val angle = (delta.toFloat() / DURATION) * ROTATION_DEGREES

        for (i in bars.indices) {
            val bar = bars[i]
            var finalAngle = angle
            val scale = bars.size - i
            if (i > 0 && delta > ACCELERATE_ROTATION_DURATION) {
                val accelDelta = delta - ACCELERATE_ROTATION_DURATION
                val t = INTERPOLATOR.getInterpolation(accelDelta.toFloat() / DECELERATE_ROTATION_DURATION)
                finalAngle += ACCELERATION_ROTATION_DEGREES * scale * (1f - t)
            } else if (i > 0) {
                val t = INTERPOLATOR.getInterpolation(delta.toFloat() / ACCELERATE_ROTATION_DURATION)
                finalAngle += ACCELERATION_ROTATION_DEGREES * scale * t
            }
            rotate(bar, finalAngle.toDouble(), startPositions[i])
        }
    }

    private fun rotate(bar: SpeechBar, degrees: Double, startPos: Point) {
        val angle = Math.toRadians(degrees)
        val cosA = cos(angle)
        val sinA = sin(angle)
        val dx = startPos.x - centerX
        val dy = startPos.y - centerY
        bar.x = centerX + (dx * cosA - dy * sinA).toInt()
        bar.y = centerY + (dx * sinA + dy * cosA).toInt()
        bar.update()
    }

    companion object {
        private const val DURATION = 2000L
        private const val ACCELERATE_ROTATION_DURATION = 1000L
        private const val DECELERATE_ROTATION_DURATION = 1000L
        private const val ROTATION_DEGREES = 720f
        private const val ACCELERATION_ROTATION_DEGREES = 40f
        private val INTERPOLATOR = AccelerateDecelerateInterpolator()
    }
}

class SpeechProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val speechBars = ArrayList<SpeechBar>(BARS_COUNT)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.GRAY }
    private var animator: BarParamsAnimator? = null

    private val density: Float = resources.displayMetrics.density
    private val radius: Int = (CIRCLE_RADIUS_DP * density).toInt()
    private val spacing: Int = (CIRCLE_SPACING_DP * density).toInt()
    private val rotationRadius: Int = (ROTATION_RADIUS_DP * density).toInt()
    private val amplitude: Int = (IDLE_FLOATING_AMPLITUDE_DP * density).toInt() *
        if (density <= MDPI_DENSITY) 2 else 1

    private var isSpeaking = false
    private var animating = false
    private var barColor = -1

    private var barColors: IntArray = intArrayOf(
        Color.parseColor("#3164d7"),
        Color.parseColor("#d92d29"),
        Color.parseColor("#eeaa10"),
        Color.parseColor("#3164d7"),
        Color.parseColor("#2e9641")
    )

    private var barMaxHeights: IntArray = intArrayOf(60, 76, 58, 80, 55)

    init {
        startIdleInterpolation()
        animating = true
    }

    fun play() {
        startIdleInterpolation()
        animating = true
        postInvalidateOnAnimation()
    }

    fun stop() {
        animator?.stop()
        animator = null
        isSpeaking = false
        animating = false
        resetBars()
        invalidate()
    }

    fun setSingleColor(color: Int) {
        barColor = color
    }

    fun setColors(colors: IntArray?) {
        if (colors == null || colors.isEmpty()) return
        barColors = IntArray(BARS_COUNT) { i ->
            if (i < colors.size) colors[i] else colors[0]
        }
    }

    fun setBarMaxHeightsInDp(heights: IntArray?) {
        if (heights == null || heights.isEmpty()) return
        barMaxHeights = IntArray(BARS_COUNT) { i ->
            if (i < heights.size) heights[i] else heights[0]
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
        if (speechBars.isEmpty() && measuredWidth > 0 && measuredHeight > 0) {
            initBars()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (speechBars.isEmpty()) return

        if (animating) {
            animator?.animate()
        }

        for (i in speechBars.indices) {
            val bar = speechBars[i]
            paint.color = if (barColor != -1) barColor else barColors[i]
            canvas.drawRoundRect(bar.rect, radius.toFloat(), radius.toFloat(), paint)
        }

        if (animating) {
            postInvalidateOnAnimation()
        }
    }

    private fun initBars() {
        val firstCirclePosition = measuredWidth / 2 - 2 * spacing - 4 * radius
        for (i in 0 until BARS_COUNT) {
            val x = firstCirclePosition + (2 * radius + spacing) * i
            val maxHeightPx = (barMaxHeights[i] * density).toInt()
            speechBars.add(SpeechBar(x, measuredHeight / 2, 2 * radius, maxHeightPx, radius))
        }
    }

    private fun resetBars() {
        for (bar in speechBars) {
            bar.x = bar.startX
            bar.y = bar.startY
            bar.height = radius * 2
            bar.update()
        }
    }

    private fun startIdleInterpolation() {
        animator = IdleAnimator(speechBars, amplitude).also { it.start() }
    }

    private fun startRmsInterpolation() {
        resetBars()
        animator = RmsAnimator(speechBars).also { it.start() }
    }

    private fun startTransformInterpolation() {
        resetBars()
        animator = TransformAnimator(
            speechBars,
            width / 2,
            height / 2,
            rotationRadius
        ) {
            startRotateInterpolation()
        }.also { it.start() }
    }

    private fun startRotateInterpolation() {
        animator = RotatingAnimator(speechBars, width / 2, height / 2).also { it.start() }
    }

    fun onBeginningOfSpeech() {
        isSpeaking = true
    }

    fun onRmsChanged(rmsdB: Float) {
        if (animator == null || rmsdB < 1f) return
        if (animator !is RmsAnimator && isSpeaking) {
            startRmsInterpolation()
        }
        (animator as? RmsAnimator)?.onRmsChanged(rmsdB)
    }

    fun onEndOfSpeech() {
        isSpeaking = false
        startTransformInterpolation()
    }

    fun onResultOrOnError() {
        stop()
        play()
    }

    companion object {
        const val BARS_COUNT = 5
        private const val CIRCLE_RADIUS_DP = 5
        private const val CIRCLE_SPACING_DP = 11
        private const val ROTATION_RADIUS_DP = 25
        private const val IDLE_FLOATING_AMPLITUDE_DP = 3
        private const val MDPI_DENSITY = 1.5f
    }
}
