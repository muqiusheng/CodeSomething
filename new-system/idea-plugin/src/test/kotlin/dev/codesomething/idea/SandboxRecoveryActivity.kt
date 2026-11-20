package dev.codesomething.idea

import com.google.gson.Gson
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.command.WriteCommandAction
import java.awt.Component
import java.awt.Container
import java.awt.image.BufferedImage
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicReference
import javax.imageio.ImageIO
import javax.swing.*

/** Only registered by the isolated R4.3 acceptance launcher. */
@Suppress("DEPRECATION")
class SandboxRecoveryActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        val output = Path.of(System.getProperty("codesomething.acceptance.output"))
        val phase = System.getProperty("codesomething.acceptance.phase", "prepare")
        Files.createDirectories(output)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val tool = edt { checkNotNull(ToolWindowManager.getInstance(project).getToolWindow("CodeSomething")) }
                edt { tool.show() }
                waitFor { edt { tool.contentManager.contentCount > 0 } }
                val view = edt { tool.contentManager.contents.first().component }
                fun button(text: String) = descendants(view).filterIsInstance<JButton>().first { it.text == text }
                fun text(name: String) = descendants(view).filterIsInstance<JTextArea>().first { it.accessibleContext.accessibleName == name }.text
                if (phase == "prepare" || phase == "prepare-pending") {
                    edt { button("加载课程").doClick() }
                    waitFor { edt { text("配对状态").contains("已加载4个") } }
                    edt { button("预览提交范围").doClick() }
                    waitFor { edt { button("确认范围并配对").isEnabled } }
                    edt { button("确认范围并配对").doClick() }
                    waitFor { edt { text("配对状态").contains("当前工程已配对") } }
                    edt { button("提交并检查").doClick() }
                    waitFor { edt { text("检查报告").contains("状态：passed") } }
                    val state = project.getService(PairingStateService::class.java).state
                    if (phase == "prepare-pending") {
                        val service = project.getService(PairingStateService::class.java)
                        val paired = service.restoreBinding()!!
                        val api = PairingClient(java.net.URI("http://127.0.0.1:5191"))
                        val snapshot = api.capture(paired)
                        val key = java.util.UUID.randomUUID().toString()
                        service.pending(snapshot, key)
                        // Server accepted the request; emulate losing its response before UI checkpoint.
                        val accepted = api.startCheck(paired, snapshot.id, key)
                        Files.writeString(output.resolve("pending-job.txt"), accepted.id)
                        Files.writeString(output.resolve("pending-key.txt"), key)
                    } else Files.writeString(output.resolve("expected-job.txt"), state.jobId)
                    edt { Class.forName("com.intellij.configurationStore.StoreUtilKt").getMethod("forPoorJavaClientOnlySaveProjectIndEdtDoNotUseThisMethod", Project::class.java, java.lang.Boolean.TYPE).invoke(null, project, true) }
                    waitFor { runCatching { Files.readString(Path.of(project.basePath!!).resolve(".idea/workspace.xml")).contains(state.jobId) }.getOrDefault(false) }
                } else if (phase == "restore-pending") {
                    val expected = Files.readString(output.resolve("pending-job.txt"))
                    waitFor { edt { descendants(view).filterIsInstance<JButton>().any { it.text == "重试启动检查" && it.isEnabled } } }
                    val service = project.getService(PairingStateService::class.java)
                    check(service.state.pendingKey == Files.readString(output.resolve("pending-key.txt")))
                    edt { button("重试启动检查").doClick() }
                    waitFor { edt { text("检查报告").contains(expected) && text("检查报告").contains("状态：passed") } }
                    check(service.state.jobId == expected && service.state.pendingKey.isBlank())
                } else if (phase == "restore") {
                    val expected = Files.readString(output.resolve("expected-job.txt"))
                    waitFor { edt { Files.writeString(output.resolve("restore-status.txt"), text("配对状态") + "\n" + text("检查报告")); text("检查报告").contains(expected) && button("提交并检查").isEnabled } }
                    val source = Path.of(project.basePath!!).resolve("src/main/java/dev/codesomething/lab/Application.java")
                    val file = edt { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(source)!! }
                    val document = edt { FileDocumentManager.getInstance().getDocument(file)!! }
                    val original = edt { document.text }
                    edt { WriteCommandAction.runWriteCommandAction(project) { document.setText(original + "\n// unsaved recovery test\n") } }
                    check(edt { text("检查报告").contains("旧快照") })
                    check(edt { text("报告时效").contains("旧快照") })
                    edt { descendants(view).filterIsInstance<JTabbedPane>().first().selectedIndex = 1 }
                    edt { screenshot(view, output.resolve("unsaved-stale.png")) }
                    edt { WriteCommandAction.runWriteCommandAction(project) { document.setText(original) }; FileDocumentManager.getInstance().saveDocument(document) }
                    // Driver stops and restarts the isolated backend while this IDE remains running.
                    Files.writeString(output.resolve("outage-ready"), "ready")
                    waitFor { edt { text("配对状态").contains("无法连接") } }
                    Files.writeString(output.resolve("outage-observed"), "observed")
                    waitFor { edt { text("检查报告").contains(expected) && button("提交并检查").isEnabled && !text("配对状态").contains("无法连接") } }
                    check(project.getService(PairingStateService::class.java).state.jobId == expected)
                } else if (phase == "moved") {
                    waitFor { edt { text("配对状态").contains("工程目录已") } }
                    check(edt { !button("提交并检查").isEnabled })
                    val old = project.getService(PairingStateService::class.java).state.bindingId
                    edt { screenshot(view, output.resolve("moved.png")); button("预览提交范围").doClick() }
                    waitFor { edt { button("确认范围并配对").isEnabled } }
                    edt { button("确认范围并配对").doClick() }
                    waitFor { edt { text("配对状态").contains("当前工程已配对") } }
                    val service = project.getService(PairingStateService::class.java)
                    check(service.state.bindingId != old && service.state.matchesDirectory(project.basePath!!))
                    edt { button("清除本机配对").doClick() }
                    waitFor { edt { text("配对状态").contains("本机配对已清除") } }
                    check(service.state.bindingId.isBlank())
                    check(service.restoreBinding() == null)
                    edt { Class.forName("com.intellij.configurationStore.StoreUtilKt").getMethod("forPoorJavaClientOnlySaveProjectIndEdtDoNotUseThisMethod", Project::class.java, java.lang.Boolean.TYPE).invoke(null, project, true) }
                }
                edt { screenshot(view, output.resolve("$phase.png")) }
                Files.writeString(output.resolve("$phase-result.json"), Gson().toJson(mapOf("status" to "passed", "phase" to phase)))
                ApplicationManager.getApplication().invokeLater { (ApplicationManager.getApplication() as com.intellij.openapi.application.ex.ApplicationEx).exit(com.intellij.openapi.application.ex.ApplicationEx.EXIT_CONFIRMED or com.intellij.openapi.application.ex.ApplicationEx.SAVE) }
            } catch (error: Throwable) {
                Files.writeString(output.resolve("$phase-result.json"), Gson().toJson(mapOf("status" to "failed", "reason" to (error.message ?: error.javaClass.name))))
            }
        }
    }
    private fun descendants(component: Component): List<Component> = listOf(component) + if (component is Container) component.components.flatMap { descendants(it) } else emptyList()
    private fun <T> edt(block: () -> T): T {
        val value = AtomicReference<T>(); val failure = AtomicReference<Throwable>()
        ApplicationManager.getApplication().invokeAndWait { try { value.set(block()) } catch (error: Throwable) { failure.set(error) } }
        failure.get()?.let { throw it }; return value.get()
    }
    private fun waitFor(condition: () -> Boolean) {
        val deadline = System.nanoTime() + 180_000_000_000L
        while (!condition()) { check(System.nanoTime() < deadline) { "Recovery UI timed out" }; Thread.sleep(100) }
    }
    private fun screenshot(view: JComponent, path: Path) {
        val image = BufferedImage(view.width.coerceAtLeast(1), view.height.coerceAtLeast(1), BufferedImage.TYPE_INT_RGB)
        val graphics = image.createGraphics(); view.printAll(graphics); graphics.dispose(); ImageIO.write(image, "png", path.toFile())
    }
}
