package dev.codesomething.idea

import com.google.gson.Gson
import com.intellij.credentialStore.CredentialAttributes
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.command.WriteCommandAction
import java.net.URI
import java.awt.Component
import java.awt.Container
import java.awt.image.BufferedImage
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicReference
import javax.imageio.ImageIO
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JSpinner
import javax.swing.JTextArea

/** Added to the sandbox descriptor only; never registered in the shipped plugin. */
@Suppress("DEPRECATION")
class SandboxSmokeActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        val output = Path.of(System.getProperty("idea.log.path")).parent.resolve("smoke")
        Files.createDirectories(output)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val tool = edt { checkNotNull(ToolWindowManager.getInstance(project).getToolWindow("CodeSomething")) }
                edt { tool.show() }
                waitFor { edt { tool.contentManager.contentCount > 0 } }
                val view = edt { tool.contentManager.contents.first().component }
                fun button(text: String) = descendants(view).filterIsInstance<JButton>().first { it.text == text }
                fun status() = descendants(view).filterIsInstance<JTextArea>().first { it.accessibleContext.accessibleName == "配对状态" }.text
                edt {
                    descendants(view).filterIsInstance<JSpinner>().single().value = 5191
                    check(!button("确认范围并配对").isEnabled)
                    button("加载课程").doClick()
                }
                waitFor { edt { status().contains("已加载4个") } }
                edt { button("预览提交范围").doClick() }
                waitFor { edt { button("确认范围并配对").isEnabled } }
                edt { screenshot(view, output.resolve("preview.png")); button("确认范围并配对").doClick() }
                waitFor { edt { status().contains("当前工程已配对") } }
                val metadata = project.getService(PairingStateService::class.java).state
                check(metadata.bindingId.isNotBlank() && metadata.courseId == "boot-foundations")
                val stored = PasswordSafe.instance.get(CredentialAttributes("CodeSomething:${project.locationHash}"))
                check(stored?.password != null)
                edt { screenshot(view, output.resolve("paired.png")) }
                if (System.getProperty("codesomething.acceptance.r42") == "true") {
                    val source = Path.of(project.basePath!!).resolve("src/main/java/dev/codesomething/lab/Application.java")
                    val original = Files.readString(source)
                    val file = edt { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(source)!! }
                    val document = edt { FileDocumentManager.getInstance().getDocument(file)!! }
                    fun edit(text: String) = edt { WriteCommandAction.runWriteCommandAction(project) { document.setText(text.replace("\r\n", "\n")) } }
                    fun report() = descendants(view).filterIsInstance<JTextArea>().first { it.accessibleContext.accessibleName == "检查报告" }.text
                    try {
                        edit(original + "\ninvalid compilation input\n")
                        edt { button("提交并检查").doClick() }
                        waitFor { edt { report().contains("状态：compile_error") && button("跳转所选错误").isEnabled } }
                        edt { screenshot(view, output.resolve("compile-error.png")); button("跳转所选错误").doClick() }
                        val navigated = edt { FileEditorManager.getInstance(project).selectedTextEditor!! }
                        check(edt { FileDocumentManager.getInstance().getFile(navigated.document)!!.path == file.path })
                        check(edt { navigated.caretModel.logicalPosition.line > 0 })
                        edit(original)
                        edt { button("提交并检查").doClick() }
                        waitFor { edt { report().contains("状态：passed") } }
                        val passed = edt { report() }
                        val jobId = passed.substringAfter("作业：").substringBefore('\n')
                        val binding = WorkspaceBinding(metadata.bindingId, metadata.directory, stored!!.getPasswordAsString()!!)
                        val api = PairingClient(URI("http://127.0.0.1:5191"))
                        val job = api.job(binding, jobId)
                        check(job.status == "passed" && job.report!!.functionalPassed)
                        edt { screenshot(view, output.resolve("passed.png")) }
                        // Private runtime file used by browser acceptance, never copied into public evidence.
                        Files.writeString(output.resolve("browser-transfer.json"), Gson().toJson(mapOf("code" to api.handoff(binding, jobId), "jobId" to jobId, "submissionId" to job.submissionId)))
                        edt { button("提交并检查").doClick() }
                        waitFor { edt { button("取消检查").isEnabled } }
                        edt { button("取消检查").doClick() }
                        waitFor { edt { report().contains("状态：cancelled") } }
                        check(Files.readString(source) == original)
                        Files.writeString(output.resolve("result.json"), Gson().toJson(mapOf("status" to "passed", "compileErrorThroughUi" to true,
                            "errorNavigatedToEditor" to true,"unsavedEditCaptured" to true,"fixedCodePassed" to true,"cancelThroughUi" to true,
                            "originalBytesPreserved" to true,"jobId" to jobId,"submissionId" to job.submissionId)))
                    } finally { edit(original); edt { FileDocumentManager.getInstance().saveDocument(document) } }
                    return@executeOnPooledThread
                }
                Files.writeString(output.resolve("result.json"), Gson().toJson(mapOf(
                    "status" to "passed", "toolWindowCreated" to true, "publishedLessonsLoaded" to 4,
                    "previewConfirmed" to true, "pairedThroughUi" to true, "credentialStoreUsed" to true,
                    "metadataHasNoTokenField" to metadata.javaClass.declaredFields.none { it.name.contains("token", true) })))
            } catch (error: Throwable) {
                Files.writeString(output.resolve("result.json"), Gson().toJson(mapOf("status" to "failed", "reason" to (error.message ?: error.javaClass.name))))
            }
        }
    }
    private fun descendants(component: Component): List<Component> = listOf(component) +
        if (component is Container) component.components.flatMap { descendants(it) } else emptyList()
    private fun <T> edt(block: () -> T): T {
        val value = AtomicReference<T>()
        val failure = AtomicReference<Throwable>()
        ApplicationManager.getApplication().invokeAndWait { try { value.set(block()) } catch (error: Throwable) { failure.set(error) } }
        failure.get()?.let { throw it }
        return value.get()
    }
    private fun waitFor(condition: () -> Boolean) {
        val deadline = System.nanoTime() + 120_000_000_000L
        while (!condition()) { check(System.nanoTime() < deadline) { "Sandbox UI timed out" }; Thread.sleep(100) }
    }
    private fun screenshot(view: JComponent, path: Path) {
        val image = BufferedImage(view.width.coerceAtLeast(1), view.height.coerceAtLeast(1), BufferedImage.TYPE_INT_RGB)
        val graphics = image.createGraphics()
        view.printAll(graphics)
        graphics.dispose()
        ImageIO.write(image, "png", path.toFile())
    }
}
