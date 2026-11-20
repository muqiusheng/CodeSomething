package dev.codesomething.idea

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.StoragePathMacros
import com.intellij.openapi.project.Project

class PairingMetadata {
    var bindingId = ""
    var directory = ""
    var courseId = ""
    var courseVersion = ""
    var stageId = ""
    var port = 5188
    var jobId = ""
    var pendingSubmissionId = ""
    var pendingDigest = ""
    var pendingKey = ""
    var pendingFilesJson = "[]"
    var jobFilesJson = "[]"

    fun pendingFiles(): List<AllowedFile> = com.google.gson.Gson().fromJson(pendingFilesJson, Array<AllowedFile>::class.java).toList()
    fun jobFiles(): List<AllowedFile> = com.google.gson.Gson().fromJson(jobFilesJson, Array<AllowedFile>::class.java).toList()
    fun matchesDirectory(current: String) = java.nio.file.Path.of(directory).normalize() == java.nio.file.Path.of(current).normalize()
    fun copy(): PairingMetadata = com.google.gson.Gson().fromJson(com.google.gson.Gson().toJson(this), PairingMetadata::class.java)
    fun withJob(id: String) = copy().apply { jobId = id; jobFilesJson = pendingFilesJson; pendingFilesJson = "[]"; pendingSubmissionId = ""; pendingDigest = ""; pendingKey = "" }
}

@Service(Service.Level.PROJECT)
@State(name = "CodeSomethingPairing", storages = [Storage(StoragePathMacros.WORKSPACE_FILE)])
class PairingStateService(private val project: Project) : PersistentStateComponent<PairingMetadata> {
    @Volatile private var metadata = PairingMetadata()
    override fun getState() = metadata
    override fun loadState(state: PairingMetadata) { metadata = state }

    /** Credential-store I/O runs in the tool window's background task. */
    fun save(binding: WorkspaceBinding, lesson: LessonTarget, port: Int = 5188) {
        PasswordSafe.instance.set(CredentialAttributes("CodeSomething:${project.locationHash}"), Credentials(binding.id, binding.token))
        PasswordSafe.instance.set(CredentialAttributes("CodeSomething:binding:${binding.id}"), Credentials(binding.id, binding.token))
        metadata = PairingMetadata().apply {
            bindingId = binding.id
            directory = binding.directory
            courseId = lesson.courseId
            courseVersion = lesson.courseVersion
            stageId = lesson.stageId
            this.port = port
        }
    }

    fun restoreBinding(): WorkspaceBinding? {
        val saved = metadata
        if (saved.bindingId.isBlank()) return null
        val credentials = PasswordSafe.instance.get(CredentialAttributes("CodeSomething:binding:${saved.bindingId}"))
            ?: PasswordSafe.instance.get(CredentialAttributes("CodeSomething:${project.locationHash}"))
        if (credentials?.userName != saved.bindingId) return null
        return credentials.getPasswordAsString()?.let { WorkspaceBinding(saved.bindingId, saved.directory, it) }
    }

    @Synchronized fun pending(snapshot: CodeSnapshot, key: String) {
        metadata = metadata.copy().apply { pendingSubmissionId = snapshot.id; pendingDigest = snapshot.digest; pendingKey = key; pendingFilesJson = com.google.gson.Gson().toJson(snapshot.files) }
    }
    @Synchronized fun job(id: String) { metadata = metadata.withJob(id) }
    fun forget() {
        val saved = metadata
        PasswordSafe.instance.set(CredentialAttributes("CodeSomething:binding:${saved.bindingId}"), null)
        PasswordSafe.instance.set(CredentialAttributes("CodeSomething:${project.locationHash}"), null)
        metadata = PairingMetadata()
    }
}
