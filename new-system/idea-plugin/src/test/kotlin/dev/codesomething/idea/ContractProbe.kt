package dev.codesomething.idea

import java.net.URI
import java.nio.file.Files
import java.nio.file.Path

/** Actual HTTP acceptance against an isolated backend, never the daily database. */
object ContractProbe {
    @JvmStatic fun main(args: Array<String>) {
        val client = PairingClient(URI(args[0]))
        val directory = Path.of(args[1])
        val source = directory.resolve("src/main/java/dev/codesomething/lab/Application.java")
        val original = Files.readAllBytes(source)
        val lessons = client.lessons("boot-foundations", "1.0.0")
        check(lessons.size == 4)
        val target = lessons.first().target
        val preview = client.preview(directory, target)
        check(preview.files.any { it.path == "pom.xml" })
        check(preview.files.any { it.path.endsWith("Application.java") })
        val binding = client.pair(preview)
        check(binding.id.isNotBlank() && binding.token.isNotBlank())
        val repeated = runCatching { client.pair(preview) }.exceptionOrNull()
        check(repeated is IllegalStateException)
        val second = client.preview(directory, target)
        try {
            Files.write(source, original + "\n// acceptance-only edit\n".toByteArray())
            val changed = runCatching { client.pair(second) }.exceptionOrNull()
            check(changed is IllegalStateException && changed.message!!.contains("修改"))
        } finally { Files.write(source, original) }
        check(Files.readAllBytes(source).contentEquals(original))
        println("{\"status\":\"passed\",\"publishedLessons\":4,\"authorizedFiles\":${preview.files.size},\"pairing\":true,\"usedCodeRejected\":true,\"changedSnapshotRejected\":true,\"originalBytesRestored\":true}")
    }
}
