package top.rootu.lampa.helpers

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

object Coroutines {
    private val lock = Any()
    private val scopeList = hashMapOf<String, Pair<Job, CoroutineScope>>()
    private val jobList = hashMapOf<String, MutableList<Job>>()

    private fun getScopeLocked(
        name: String,
        dispatcher: CoroutineDispatcher = Dispatchers.IO
    ): CoroutineScope {
        scopeList[name]?.let { return it.second }

        val job = SupervisorJob()
        val scope = CoroutineScope(dispatcher + job)
        scopeList[name] = Pair(job, scope)
        jobList[name] = mutableListOf()
        return scope
    }

    fun running(name: String): Boolean {
        synchronized(lock) {
            val jobs = jobList[name] ?: return false
            jobs.removeAll { !it.isActive }
            return jobs.isNotEmpty()
        }
    }

    fun launch(name: String, fn: suspend () -> Unit) {
        synchronized(lock) {
            val scope = getScopeLocked(name)
            val jobs = jobList.getOrPut(name) { mutableListOf() }
            jobs.removeAll { !it.isActive }
            val job = scope.launch { fn() }
            jobs.add(job)
        }
    }

    fun remove(name: String) {
        synchronized(lock) {
            scopeList[name]?.first?.cancelChildren()
            jobList.remove(name)
            scopeList.remove(name)
        }
    }

    fun cancel(name: String) {
        synchronized(lock) {
            scopeList[name]?.first?.cancelChildren()
            jobList[name]?.clear()
        }
    }

    fun join(name: String) {
        val jobsSnapshot = synchronized(lock) {
            jobList[name]?.filter { it.isActive }?.toList().orEmpty()
        }
        if (jobsSnapshot.isNotEmpty()) {
            runBlocking {
                jobsSnapshot.joinAll()
            }
        }
    }
}