package dev.codesomething.idea

import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.net.URI
import java.nio.file.Files

class PairingClientTest {
    @Test fun `recovery keeps the same job and retry key but requires confirmation after directory movement`() {
        val saved = PairingMetadata().apply {
            bindingId = "b1"; directory = "D:/old"; courseId = "boot-foundations"
            courseVersion = "1.0.0"; stageId = "boot-start"; jobId = "job-1"
            pendingSubmissionId = "s1"; pendingDigest = "abc"; pendingKey = "retry-1"; port = 5191
        }
        assertTrue(saved.matchesDirectory("D:/old"))
        assertFalse(saved.matchesDirectory("D:/moved"))
        val restored = saved.withJob("job-2")
        assertEquals("job-2", restored.jobId)
        assertEquals("", restored.pendingKey)
        assertEquals("job-1", saved.jobId)
        assertEquals(5191, restored.port)
        assertFalse(com.google.gson.Gson().toJson(restored).contains("token", true))
    }
    @Test fun `report refresh preserves failed assertions and cancellation uses the same job and authorization`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/jobs/job-1") { request ->
            assertEquals("Bearer private-token", request.requestHeaders.getFirst("Authorization"))
            val cancel = request.requestURI.path.endsWith("/cancel")
            assertEquals(if (cancel) "POST" else "GET", request.requestMethod)
            val response = (if (cancel) """{"id":"job-1","submissionId":"s1","status":"cancelled","message":"检查已取消。","freshness":"current"}"""
                else """{"id":"job-1","submissionId":"s1","status":"business_error","message":"接口行为未符合约定。","freshness":"changed","stale":true,"report":{"snapshotDigest":"abc","courseVersion":"1.0.0","stageId":"boot-start","policy":"boot-start","functionalPassed":false,"assertions":[{"name":"状态码","passed":false,"expected":"200","actual":"500"}],"log":"failure"}}""").toByteArray()
            request.sendResponseHeaders(200, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val client = PairingClient(URI("http://127.0.0.1:${server.address.port}"))
            val binding = WorkspaceBinding("b1", "D:/practice", "private-token")
            val report = client.job(binding, "job-1")
            assertFalse(report.active)
            assertTrue(report.stale)
            assertEquals("500", report.report!!.assertions.single().actual)
            assertEquals("cancelled", client.cancel(binding, "job-1").status)
        } finally { server.stop(0) }
    }
    @Test fun `compiler and test locations only navigate to authorized regular files`() {
        val root = Files.createTempDirectory("cs-errors-")
        try {
            Files.createDirectories(root.resolve("src/main/java/lab"))
            Files.writeString(root.resolve("src/main/java/lab/Application.java"), "class Application {}")
            val files = listOf(AllowedFile("src/main/java/lab/Application.java", 20, "digest"))
            val log = """
                [ERROR] /workspace/src/main/java/lab/Application.java:[12,7] missing symbol
                at lab.Application.run(Application.java:18)
                /workspace/secrets.txt:1: error
                /workspace/../outside.java:2: error
            """.trimIndent()
            val locations = ReportLocations.find(root, files, log)
            assertEquals(listOf(12, 18), locations.map { it.line })
            assertEquals(listOf(7, 1), locations.map { it.column })
            assertTrue(locations.all { it.path == "src/main/java/lab/Application.java" })
            assertTrue(ReportLocations.find(root, files, "Application.java:0: error").isEmpty())
        } finally {
            root.toFile().deleteRecursively()
        }
    }
    @Test fun `paired project captures current bytes and starts an authorized idempotent check`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val seen = mutableListOf<String>()
        server.createContext("/api/v1/") { request ->
            assertEquals("Bearer private-token", request.requestHeaders.getFirst("Authorization"))
            val body = request.requestBody.bufferedReader().readText()
            seen.add(request.requestURI.path)
            val response = when (request.requestURI.path) {
                "/api/v1/workspace-bindings/binding-1/preview" -> """{"digest":"current-digest","files":[{"path":"TaskServer.java","bytes":42,"sha256":"abc"}]}"""
                "/api/v1/submissions" -> {
                    assertTrue(body.contains("current-digest") && body.contains("binding-1"))
                    """{"id":"submission-1","digest":"current-digest"}"""
                }
                else -> {
                    assertTrue(body.contains("submission-1") && body.contains("stable-key"))
                    """{"id":"job-1","submissionId":"submission-1","status":"queued","message":"检查已排队。","stale":false,"freshness":"current"}"""
                }
            }.toByteArray()
            request.sendResponseHeaders(200, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val client = PairingClient(URI("http://127.0.0.1:${server.address.port}"))
            val binding = WorkspaceBinding("binding-1", "D:/practice", "private-token")
            val snapshot = client.capture(binding)
            val job = client.startCheck(binding, snapshot.id, "stable-key")
            assertEquals("job-1", job.id)
            assertEquals("queued", job.status)
            assertEquals(listOf("/api/v1/workspace-bindings/binding-1/preview", "/api/v1/submissions", "/api/v1/check-jobs"), seen)
        } finally { server.stop(0) }
    }
    @Test fun `the lesson selector uses published titles and excludes reading-only chapters`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/courses/http-json-basics/versions/1.1.0") { request ->
            val response = """{"courseId":"http-json-basics","courseVersion":"1.1.0","status":"published","chapters":[{"stageId":"request","title":"HTTP请求","mode":"reading"},{"stageId":"fix-response","title":"修复接口","mode":"code"}]}""".toByteArray()
            request.sendResponseHeaders(200, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val lessons = PairingClient(URI("http://127.0.0.1:${server.address.port}")).lessons("http-json-basics", "1.1.0")
            assertEquals(listOf("修复接口"), lessons.map { it.title })
            assertEquals("fix-response", lessons.single().target.stageId)
        } finally { server.stop(0) }
    }

    @Test fun `a preview for another directory cannot authorize the open project`() {
        val directory = Files.createTempDirectory("cs-idea-root-")
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/workspace-previews") { request ->
            val response = """{"id":"preview-1","directory":"D:/some-other-project","digest":"digest","files":[],"pairingCode":"code","expiresAt":"2099-01-01T00:00:00Z"}""".toByteArray()
            request.sendResponseHeaders(200, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val client = PairingClient(URI("http://127.0.0.1:${server.address.port}"))
            assertThrows(IllegalStateException::class.java) {
                client.preview(directory, LessonTarget("boot-foundations", "1.0.0", "boot-start"))
            }
        } finally { server.stop(0); Files.delete(directory) }
    }

    @Test fun `changed files cannot be paired with an earlier preview and the recovery reason is preserved`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/workspace-bindings") { request ->
            val response = """{"code":"SNAPSHOT_CHANGED","message":"文件已经修改，请重新预览后确认。"}""".toByteArray()
            request.sendResponseHeaders(409, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val client = PairingClient(URI("http://127.0.0.1:${server.address.port}"))
            val failure = assertThrows(IllegalStateException::class.java) {
                client.pair(WorkspacePreview("old-preview", "D:/practice", "digest", emptyList(), "code", "2099-01-01T00:00:00Z"))
            }
            assertTrue(failure.message!!.contains("文件已经修改"), failure.message)
        } finally { server.stop(0) }
    }

    @Test fun `a remote service or credential-bearing URL is rejected before any project data is sent`() {
        for (url in listOf("http://example.com:5188", "http://127.0.0.1.example.com:5188", "http://user:secret@127.0.0.1:5188", "http://127.0.0.1:5188/redirect", "https://127.0.0.1:5188")) {
            assertThrows(IllegalArgumentException::class.java) { PairingClient(URI(url)) }
        }
    }

    @Test fun `confirm pairs only the preview code and keeps the token out of display text`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/workspace-bindings") { request ->
            assertEquals("POST", request.requestMethod)
            val body = request.requestBody.bufferedReader().readText()
            assertTrue(body.contains("preview-1") && body.contains("one-time-code"))
            val response = """{"id":"binding-1","directory":"D:/practice","token":"private-binding-token"}""".toByteArray()
            request.sendResponseHeaders(200, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val client = PairingClient(URI("http://127.0.0.1:${server.address.port}"))
            val binding = client.pair(WorkspacePreview("preview-1", "D:/practice", "digest", emptyList(), "one-time-code", "2099-01-01T00:00:00Z"))
            assertEquals("binding-1", binding.id)
            assertEquals("private-binding-token", binding.token)
            assertFalse(binding.toString().contains("private-binding-token"))
        } finally { server.stop(0) }
    }

    @Test fun `preview lists the backend-authorized files for the open project`() {
        val directory = Files.createTempDirectory("cs-idea-preview-")
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/workspace-previews") { request ->
            assertEquals("POST", request.requestMethod)
            val body = request.requestBody.bufferedReader().readText()
            assertTrue(body.contains("boot-foundations"))
            val normalized = directory.toString().replace("\\", "\\\\")
            val response = """{"id":"preview-1","directory":"$normalized","digest":"abc123","files":[{"path":"pom.xml","bytes":120,"sha256":"file123"}],"pairingCode":"one-time-code","expiresAt":"2099-01-01T00:00:00Z"}""".toByteArray()
            request.sendResponseHeaders(200, response.size.toLong())
            request.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val client = PairingClient(URI("http://127.0.0.1:${server.address.port}"))
            val preview = client.preview(directory, LessonTarget("boot-foundations", "1.0.0", "boot-start"))
            assertEquals("pom.xml", preview.files.single().path)
            assertEquals(directory.toString(), preview.directory)
            assertEquals("abc123", preview.digest)
        } finally {
            server.stop(0)
            Files.delete(directory)
        }
    }
}
