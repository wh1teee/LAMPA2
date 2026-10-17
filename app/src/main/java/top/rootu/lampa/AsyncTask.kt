package top.rootu.lampa

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

abstract class AsyncTask<Params, Progress, Result>(private val taskName: String) {

    enum class Status {
        PENDING,
        RUNNING,
        FINISHED
    }

    companion object {
        private val singleThreadDispatcher: CoroutineDispatcher by lazy {
            Executors.newSingleThreadExecutor().asCoroutineDispatcher()
        }
    }

    @Volatile
    var isCancelled = false

    @Volatile
    var status: Status = Status.PENDING
    private var job: Job? = null

    private val className by lazy {
        AsyncTask::class.java.simpleName
    }

    abstract fun doInBackground(vararg params: Params?): Result
    open fun onProgressUpdate(vararg values: Progress?) {}
    open fun onPostExecute(result: Result?) {}
    open fun onPreExecute() {}
    open fun onCancelled(result: Result?) {}

    /**
     * Executes background task in parallel using Dispatchers.IO.
     */
    fun execute(vararg params: Params?) {
        execute(Dispatchers.IO, *params)
    }

    /**
     * Executes background tasks sequentially on a single-thread executor.
     */
    fun executeOnExecutor(vararg params: Params?) {
        execute(singleThreadDispatcher, *params)
    }

    private fun execute(dispatcher: CoroutineDispatcher, vararg params: Params?) {
        when (status) {
            Status.RUNNING -> throw IllegalStateException("Cannot execute task: the task is already running.")
            Status.FINISHED -> throw IllegalStateException(
                "Cannot execute task: the task has already been executed (a task can be executed only once)"
            )
            Status.PENDING -> Unit
        }

        status = Status.RUNNING

        job = CoroutineScope(Dispatchers.Main).launch {
            printLog("$taskName onPreExecute started")
            onPreExecute()
            printLog("$taskName onPreExecute finished")

            val result = try {
                withContext(dispatcher) {
                    printLog("$taskName doInBackground started")
                    doInBackground(*params)
                }
            } catch (e: CancellationException) {
                status = Status.FINISHED
                onCancelled(null)
                throw e
            }

            if (!isCancelled) {
                onPostExecute(result)
                printLog("$taskName doInBackground finished")
            } else {
                onCancelled(result)
            }
            status = Status.FINISHED
        }
    }

    fun cancel(mayInterruptIfRunning: Boolean) {
        val currentJob = job ?: run {
            printLog("$taskName has already been cancelled/finished/not yet started.")
            return
        }
        if (mayInterruptIfRunning || !currentJob.isActive) {
            isCancelled = true
            status = Status.FINISHED
            currentJob.cancel(CancellationException("$taskName: Coroutine Task cancelled"))
            printLog("$taskName has been cancelled.")
        }
    }

    fun publishProgress(vararg progress: Progress) {
        CoroutineScope(Dispatchers.Main).launch {
            if (!isCancelled) {
                onProgressUpdate(*progress)
            }
        }
    }

    private fun printLog(message: String) {
        if (BuildConfig.DEBUG) Log.d(className, message)
    }
}