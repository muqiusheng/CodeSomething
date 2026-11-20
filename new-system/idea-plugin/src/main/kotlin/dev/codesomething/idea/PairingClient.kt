package dev.codesomething.idea

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Path
import java.time.Duration
import com.google.gson.Gson
import com.google.gson.JsonObject

data class LessonTarget(val courseId: String, val courseVersion: String, val stageId: String)
data class LessonChoice(val title: String, val target: LessonTarget) { override fun toString() = title }
data class AllowedFile(val path: String, val bytes: Long, val sha256: String)
data class WorkspacePreview(val id: String, val directory: String, val digest: String, val files: List<AllowedFile>, val pairingCode: String, val expiresAt: String)
class WorkspaceBinding(val id: String, val directory: String, val token: String)
data class CodeSnapshot(val id: String, val digest: String, val files: List<AllowedFile> = emptyList())
data class CheckAssertion(val name: String, val passed: Boolean, val expected: String?, val actual: String?)
data class CheckReport(val snapshotDigest: String, val courseVersion: String, val stageId: String,
    val policy: String, val functionalPassed: Boolean, val assertions: List<CheckAssertion>, val log: String)
data class CheckJob(val id: String, val submissionId: String, val status: String, val message: String,
    val report: CheckReport?, val stale: Boolean, val freshness: String) {
    val active: Boolean get() = status in setOf("queued", "running", "cancelling", "awaiting_runner")
}

class PairingClient(private val base: URI) {
    init {
        require(base.scheme == "http" && base.host in setOf("127.0.0.1", "localhost") &&
            base.port in 1..65535 && base.rawUserInfo == null && base.rawQuery == null &&
            base.rawFragment == null && base.path in listOf("", "/")) {
            "只允许连接本机http://127.0.0.1:<端口>学习服务。"
        }
    }
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build()
    private val json = Gson()

    fun capture(binding: WorkspaceBinding): CodeSnapshot {
        val current = current(binding)
        return json.fromJson(request("/submissions", mapOf("bindingId" to binding.id,
            "expectedDigest" to current.digest), binding.token), CodeSnapshot::class.java).copy(files = current.files)
    }

    fun current(binding: WorkspaceBinding): WorkspacePreview = json.fromJson(
        request("/workspace-bindings/${safeId(binding.id)}/preview", token = binding.token), WorkspacePreview::class.java)

    fun startCheck(binding: WorkspaceBinding, submissionId: String, key: String): CheckJob = json.fromJson(
        request("/check-jobs", mapOf("submissionId" to submissionId, "idempotencyKey" to key), binding.token), CheckJob::class.java)

    fun job(binding: WorkspaceBinding, id: String): CheckJob = json.fromJson(
        request("/jobs/${safeId(id)}", token = binding.token), CheckJob::class.java)

    fun cancel(binding: WorkspaceBinding, id: String): CheckJob = json.fromJson(
        request("/jobs/${safeId(id)}/cancel", emptyMap<String, String>(), binding.token), CheckJob::class.java)

    fun handoff(binding: WorkspaceBinding, id: String): String = request("/ide-handoffs",
        mapOf("bindingId" to binding.id, "jobId" to safeId(id)), binding.token).get("code").asString

    private fun safeId(id: String): String {
        require(id.matches(Regex("[a-zA-Z0-9_-]{1,100}"))) { "无效的作业或配对编号。" }
        return id
    }

    fun lessons(courseId: String, version: String): List<LessonChoice> {
        require(courseId.matches(Regex("[a-z-]+")) && version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")))
        val result = request("/courses/$courseId/versions/$version")
        check(result.get("courseId").asString == courseId && result.get("courseVersion").asString == version &&
            result.get("status").asString == "published") { "课程版本尚未发布。" }
        return result.getAsJsonArray("chapters").map { it.asJsonObject }
            .filter { it.get("mode")?.asString != "reading" }
            .map { LessonChoice(it.get("title").asString, LessonTarget(courseId, version, it.get("stageId").asString)) }
    }

    fun pair(preview: WorkspacePreview): WorkspaceBinding {
        val payload = mapOf("previewId" to preview.id, "pairingCode" to preview.pairingCode)
        val binding = json.fromJson(post("/workspace-bindings", payload), WorkspaceBinding::class.java)
        check(binding.directory == preview.directory) { "配对目录与预览不一致，请重新预览。" }
        return binding
    }

    fun preview(directory: Path, lesson: LessonTarget): WorkspacePreview {
        val payload = mapOf("directory" to directory.toString(), "courseId" to lesson.courseId,
            "courseVersion" to lesson.courseVersion, "stageId" to lesson.stageId)
        val preview = json.fromJson(post("/workspace-previews", payload), WorkspacePreview::class.java)
        check(Path.of(preview.directory).normalize() == directory.normalize()) { "预览目录与当前工程不一致，请重新选择工程。" }
        return preview
    }

    private fun post(route: String, payload: Any): JsonObject {
        return request(route, payload)
    }

    private fun request(route: String, payload: Any? = null, token: String? = null): JsonObject {
        val builder = HttpRequest.newBuilder(base.resolve("/api/v1$route"))
            .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
        if (token != null) builder.header("Authorization", "Bearer $token")
        val request = if (payload == null) builder.GET().build()
            else builder.POST(HttpRequest.BodyPublishers.ofString(json.toJson(payload))).build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofInputStream())
        val bytes = response.body().use { it.readNBytes(1_048_577) }
        check(bytes.size <= 1_048_576) { "服务返回内容过大，请检查本机服务。" }
        val result = try { json.fromJson(bytes.toString(Charsets.UTF_8), JsonObject::class.java) }
            catch (_: Exception) { throw IllegalStateException("服务返回数据格式异常，请检查本机服务。") }
        check(response.statusCode() == 200) {
            result?.get("message")?.asString ?: "本机服务请求失败（HTTP ${response.statusCode()}）"
        }
        check(result != null) { "服务返回内容为空，请重试。" }
        return result
    }
}
