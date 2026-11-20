package dev.codesomething.idea

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.content.ContentFactory
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.net.URI
import java.nio.file.Path
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.swing.*

class LearningToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val view = PairingPanel(project)
        val content = ContentFactory.getInstance().createContent(view.component, "", false)
        content.setDisposer(view)
        toolWindow.contentManager.addContent(content)
    }
}

private data class CourseChoice(val title: String, val id: String, val version: String) {
    override fun toString() = title
}

private class PairingPanel(private val project: Project) : Disposable {
    val component = JPanel(BorderLayout(0, JBUI.scale(10)))
    private val course = ComboBox(arrayOf(
        CourseChoice("接口启动实验室", "boot-foundations", "1.0.0"),
        CourseChoice("后端入门实验室", "http-json-basics", "1.1.0"),
        CourseChoice("个人任务管理", "task-manager", "1.0.0"),
        CourseChoice("学习计划与任务协作", "collaboration", "1.0.0")))
    private val lesson = ComboBox<LessonChoice>()
    private val port = JSpinner(SpinnerNumberModel(Integer.getInteger("codesomething.backend.port", 5188), 1024, 65535, 1))
    private val load = JButton("加载课程")
    private val inspect = JButton("预览提交范围")
    private val confirm = JButton("确认范围并配对")
    private val open = JButton("在网页中学习")
    private val submit = JButton("提交并检查")
    private val refresh = JButton("刷新状态")
    private val reconnect = JButton("恢复连接")
    private val forget = JButton("清除本机配对")
    private val cancel = JButton("取消检查")
    private val locate = JButton("跳转所选错误")
    private val webReport = JButton("在网页查看报告")
    private val locations = ComboBox<ReportLocation>()
    private val reportText = JBTextArea()
    private val previewText = JBTextArea()
    private val status = JBTextArea("选择课程并加载关卡，然后预览当前工程允许读取的文件。")
    private val freshness = JBTextArea()
    private var preview: WorkspacePreview? = null
    private var busy = false
    private var binding: WorkspaceBinding? = null
    private var allowedFiles = emptyList<AllowedFile>()
    private var job: CheckJob? = null
    private var pendingSnapshot: CodeSnapshot? = null
    private var pendingKey: String? = null
    private var disposed = false
    private var restoring = false
    private var connected = false
    private var dirty = false
    private var retryConnection = false
    private val state get() = project.getService(PairingStateService::class.java)
    private val poll = Timer(3000) { if (!busy && component.isShowing) {
        if (!connected && retryConnection && state.state.bindingId.isNotBlank()) restorePairing()
        else if (job != null) refreshJob()
    } }

    override fun dispose() { disposed = true; poll.stop(); binding = null }

    init {
        component.border = JBUI.Borders.empty(12)
        port.editor = JSpinner.NumberEditor(port, "0")
        val form = JPanel().apply { layout = BoxLayout(this, BoxLayout.Y_AXIS) }
        fun field(label: String, control: JComponent) {
            form.add(JBLabel(label).apply { labelFor = control; alignmentX = 0f; border = JBUI.Borders.emptyTop(8) })
            form.add(control)
            control.accessibleContext.accessibleName = label
            control.alignmentX = 0f
        }
        field("本机服务端口", port)
        field("课程", course)
        field("关卡", lesson)
        form.add(JPanel(FlowLayout(FlowLayout.LEADING, 0, JBUI.scale(8))).apply { alignmentX = 0f; add(load) })
        val directory = JBTextArea(project.basePath ?: "请先打开练习工程").apply {
            isEditable = false; lineWrap = true; wrapStyleWord = true; isOpaque = false
        }
        field("当前工程", directory)
        component.add(form, BorderLayout.NORTH)
        previewText.apply {
            isEditable = false; lineWrap = true; wrapStyleWord = true
            accessibleContext.accessibleName = "允许读取的文件与快照摘要"
            text = "预览后会在这里列出文件。确认前不会建立配对。"
        }
        reportText.apply {
            isEditable = false; lineWrap = true; wrapStyleWord = true
            accessibleContext.accessibleName = "检查报告"
            text = "提交后显示隔离检查结果。功能通过后，请在网页完成理解验证。"
        }
        val tabs = JTabbedPane().apply {
            addTab("允许文件", JBScrollPane(previewText))
            addTab("检查报告", JBScrollPane(reportText))
        }
        component.add(tabs, BorderLayout.CENTER)
        val footer = JPanel().apply { layout = BoxLayout(this, BoxLayout.Y_AXIS) }
        footer.add(JPanel(FlowLayout(FlowLayout.LEADING, JBUI.scale(4), JBUI.scale(4))).apply { add(inspect); add(confirm) })
        footer.add(JPanel(FlowLayout(FlowLayout.LEADING, JBUI.scale(4), JBUI.scale(4))).apply { add(open); add(webReport) })
        footer.add(JPanel(FlowLayout(FlowLayout.LEADING, JBUI.scale(4), JBUI.scale(4))).apply { add(submit); add(refresh); add(cancel) })
        footer.add(JPanel(FlowLayout(FlowLayout.LEADING, JBUI.scale(4), JBUI.scale(4))).apply { add(reconnect); add(forget) })
        locations.accessibleContext.accessibleName = "报告中的错误位置"
        locations.maximumSize = java.awt.Dimension(Int.MAX_VALUE, JBUI.scale(32))
        footer.add(locations)
        footer.add(JPanel(FlowLayout(FlowLayout.LEADING, JBUI.scale(4), JBUI.scale(4))).apply { add(locate) })
        status.apply {
            isEditable = false; lineWrap = true; wrapStyleWord = true; isOpaque = false
            accessibleContext.accessibleName = "配对状态"
        }
        footer.add(status)
        freshness.apply {
            isEditable = false; lineWrap = true; wrapStyleWord = true; isOpaque = false
            accessibleContext.accessibleName = "报告时效"
        }
        footer.add(freshness)
        component.add(footer, BorderLayout.SOUTH)
        course.addActionListener { clearPreview(); lesson.removeAllItems(); updateButtons() }
        lesson.addActionListener { clearPreview() }
        port.addChangeListener { clearPreview(); lesson.removeAllItems(); updateButtons() }
        load.addActionListener { loadLessons() }
        inspect.addActionListener { inspectProject() }
        confirm.addActionListener { confirmPairing() }
        submit.addActionListener { tabs.selectedIndex = 1; submitCheck() }
        refresh.addActionListener { refreshJob() }
        reconnect.addActionListener { restorePairing() }
        forget.addActionListener {
            background("清除本机配对", { state.forget(); true }) { clearPreview(); status.text = "本机配对已清除。历史报告仍保留在服务端；提交前请重新预览并配对。" }
        }
        cancel.addActionListener {
            val api = client(); val paired = binding ?: return@addActionListener; val current = job ?: return@addActionListener
            background("取消检查", { api.cancel(paired, current.id) }) { showJob(it) }
        }
        locate.addActionListener { navigate() }
        webReport.addActionListener {
            val paired = binding ?: return@addActionListener; val current = job ?: return@addActionListener
            val target = (lesson.selectedItem as? LessonChoice)?.target ?: return@addActionListener
            val api = client()
            background("打开网页报告", { api.handoff(paired, current.id) }) { code ->
                val webPort = Integer.getInteger("codesomething.frontend.port", 5178)
                val path = if (target.courseId == "http-json-basics") "/learn/http-json/1.1/${target.stageId}" else "/learn/${target.courseId}/1.0/${target.stageId}"
                BrowserUtil.browse("http://127.0.0.1:$webPort$path?tab=%E4%BB%BB%E5%8A%A1#ide-handoff=$code")
                status.text = "已打开同一作业的网页报告，可继续理解验证。"
            }
        }
        locations.addActionListener { updateButtons() }
        open.addActionListener {
            val target = (lesson.selectedItem as? LessonChoice)?.target ?: return@addActionListener
            val webPort = Integer.getInteger("codesomething.frontend.port", 5178)
            val path = if (target.courseId == "http-json-basics") "/learn/http-json/1.1/${target.stageId}" else "/learn/${target.courseId}/1.0/${target.stageId}"
            BrowserUtil.browse("http://127.0.0.1:$webPort$path?tab=%E4%BB%BB%E5%8A%A1")
        }
        updateButtons()
        com.intellij.openapi.editor.EditorFactory.getInstance().eventMulticaster.addDocumentListener(
            object : com.intellij.openapi.editor.event.DocumentListener {
                override fun documentChanged(event: com.intellij.openapi.editor.event.DocumentEvent) {
                    val paired = binding ?: return
                    val file = FileDocumentManager.getInstance().getFile(event.document) ?: return
                    val relative = runCatching { Path.of(paired.directory).relativize(Path.of(file.path)).toString().replace('\\', '/') }.getOrNull()
                    if (allowedFiles.any { it.path == relative } && job != null) {
                        dirty = true
                        freshness.text = "旧快照：允许文件已修改，请重新提交检查。"
                        reportText.text = "当前允许文件有未提交修改，此报告对应旧快照，请重新提交检查。\n" + reportText.text.removePrefix("当前允许文件有未提交修改，此报告对应旧快照，请重新提交检查。\n")
                    }
                }
            }, this)
        if (state.state.bindingId.isNotBlank()) SwingUtilities.invokeLater { if (!disposed) restorePairing() }
    }

    private fun client() = PairingClient(URI("http://127.0.0.1:${port.value}"))
    private fun clearPreview() {
        if (restoring) return
        connected = false; dirty = false; retryConnection = false
        freshness.text = ""
        poll.stop(); binding = null; job = null; pendingSnapshot = null; pendingKey = null
        allowedFiles = emptyList(); locations.removeAllItems()
        reportText.text = "提交后显示隔离检查结果。功能通过后，请在网页完成理解验证。"
        preview = null
        previewText.text = "预览后会在这里列出文件。确认前不会建立配对。"
        status.text = "范围未确认，请预览当前工程。"
        updateButtons()
    }
    private fun updateButtons() {
        val idle = !busy && job?.active != true
        course.isEnabled = idle; lesson.isEnabled = idle; port.isEnabled = idle
        load.isEnabled = idle
        inspect.isEnabled = idle && lesson.selectedItem != null && project.basePath != null
        confirm.isEnabled = !busy && preview != null
        open.isEnabled = lesson.selectedItem != null
        submit.text = if (pendingSnapshot == null) "提交并检查" else "重试启动检查"
        submit.isEnabled = idle && binding != null && connected
        reconnect.isEnabled = !busy && state.state.bindingId.isNotBlank()
        forget.isEnabled = idle && state.state.bindingId.isNotBlank()
        refresh.isEnabled = !busy && job != null && binding != null
        cancel.isEnabled = !busy && job?.active == true && job?.status != "cancelling"
        locate.isEnabled = !busy && locations.selectedItem != null
        webReport.isEnabled = !busy && job != null && binding != null
    }
    private fun loadLessons() {
        val choice = course.selectedItem as CourseChoice
        val api = client()
        clearPreview()
        background("加载学习关卡", { api.lessons(choice.id, choice.version) }) { items ->
            lesson.removeAllItems(); items.forEach { lesson.addItem(it) }
            status.text = if (items.isEmpty()) "这门课程暂时没有IDE编码关卡。" else "已加载${items.size}个编码关卡。请选择当前学习关卡。"
        }
    }
    private fun inspectProject() {
        val target = (lesson.selectedItem as? LessonChoice)?.target ?: return
        val directory = project.basePath ?: return
        val api = client()
        clearPreview()
        // Save documents on EDT before the backend captures bytes from disk.
        saveDocuments(directory)
        background("预览允许文件", { api.preview(Path.of(directory), target) }) { result ->
            preview = result
            previewText.text = buildString {
                append("允许读取的文件\n\n")
                result.files.forEach { append("${it.path}  ·  ${it.bytes}字节\n") }
                val expiry = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault()).format(Instant.parse(result.expiresAt))
                append("\nSHA-256\n${result.digest}\n\n预览有效至 $expiry（确认配对前）")
            }
            previewText.caretPosition = 0
            status.text = "请检查文件范围。确认配对仅授权当前课程关卡。"
        }
    }
    private fun confirmPairing() {
        val current = preview ?: return
        val target = (lesson.selectedItem as? LessonChoice)?.target ?: return
        val api = client()
        background("配对当前工程", {
            val binding = api.pair(current)
            state.save(binding, target, (port.value as Number).toInt())
            binding
        }) { paired ->
            binding = paired; allowedFiles = current.files; connected = true; retryConnection = true
            preview = null
            previewText.text = previewText.text.substringBefore("\n\n预览有效至")
            status.text = "当前工程已配对。允许读取的文件范围见上方。"
        }
    }

    private fun saveDocuments(directory: String) {
        val documents = FileDocumentManager.getInstance()
        documents.unsavedDocuments.filter { document ->
            documents.getFile(document)?.let { Path.of(it.path).startsWith(Path.of(directory)) } == true
        }.forEach { documents.saveDocument(it) }
    }

    private fun submitCheck() {
        val paired = binding ?: return
        val api = client()
        if (pendingSnapshot == null) saveDocuments(paired.directory)
        background("保存快照并启动检查", {
            if (pendingSnapshot == null) {
                pendingSnapshot = api.capture(paired)
                pendingKey = UUID.randomUUID().toString()
                state.pending(pendingSnapshot!!, pendingKey!!)
            }
            api.startCheck(paired, pendingSnapshot!!.id, pendingKey!!)
        }) {
            allowedFiles = pendingSnapshot!!.files
            previewText.text = "本次提交的允许文件\n\n" + allowedFiles.joinToString("\n") { "${it.path} · ${it.bytes}字节" } + "\n\nSHA-256\n${pendingSnapshot!!.digest}"
            pendingSnapshot = null; pendingKey = null; dirty = false
            state.job(it.id)
            showJob(it)
        }
    }

    private fun refreshJob() {
        val paired = binding ?: return; val current = job ?: return; val api = client()
        background("读取检查状态", { api.job(paired, current.id) }) { showJob(it) }
    }

    private fun showJob(result: CheckJob) {
        job = result; connected = true
        freshness.text = when {
            dirty || result.stale || result.freshness == "changed" -> "旧快照：当前文件已修改，请重新提交检查。"
            result.freshness != "current" -> "当前文件无法核对，此报告对应已提交快照。"
            else -> "当前文件与提交快照一致。"
        }
        status.text = result.message
        reportText.text = buildString {
            append("作业：${result.id}\n快照：${result.submissionId}\n状态：${result.status}\n${result.message}\n")
            if (dirty || result.freshness != "current" || result.stale) append("\n此报告对应已提交快照；当前目录已改变或无法核对，请重新提交后检查。\n")
            result.report?.let { report ->
                append("\n课程版本：${report.courseVersion} · 关卡：${report.stageId}\nSHA-256：${report.snapshotDigest}\n")
                report.assertions.forEach { append("\n${if (it.passed) "通过" else "未通过"} · ${it.name}\n预期：${it.expected.orEmpty()}\n实际：${it.actual.orEmpty()}\n") }
                append("\n运行日志\n${report.log}")
            }
        }
        reportText.caretPosition = 0
        locations.removeAllItems()
        val paired = binding ?: return
        ReportLocations.find(Path.of(paired.directory), allowedFiles, result.report?.log.orEmpty()).forEach { locations.addItem(it) }
        poll.start()
        updateButtons()
    }

    private fun navigate() {
        val location = locations.selectedItem as? ReportLocation ?: return
        val paired = binding ?: return
        val path = ReportLocations.resolve(Path.of(paired.directory), allowedFiles, location)
        val file = path?.let { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(it) }
        if (file == null) { status.text = "错误位置不在当前允许文件内，或文件已移动。请查看日志。"; return }
        OpenFileDescriptor(project, file, location.line - 1, location.column - 1).navigate(true)
    }
    private fun restorePairing() {
        val saved = state.state.copy()
        if (saved.bindingId.isBlank()) return
        restoring = true
        port.value = saved.port
        for (index in 0 until course.itemCount) if (course.getItemAt(index).id == saved.courseId) course.selectedIndex = index
        restoring = false
        if (project.basePath == null || !saved.matchesDirectory(project.basePath!!)) {
            connected = false; poll.stop()
            restoring = true
            lesson.removeAllItems(); lesson.addItem(LessonChoice(saved.stageId, LessonTarget(saved.courseId, saved.courseVersion, saved.stageId)))
            restoring = false
            status.text = "工程目录已从${saved.directory}移动。请预览提交范围并确认新目录配对；历史报告保留。"
            freshness.text = "工程目录已变化，历史报告对应原目录。"
            updateButtons(); return
        }
        val api = client()
        retryConnection = true
        background("恢复配对与检查", {
            val paired = state.restoreBinding() ?: error("配对凭据不可用，请重新预览并配对。")
            val items = api.lessons(saved.courseId, saved.courseVersion)
            // Fetch the report first so missing source files do not hide historical results.
            val result = saved.jobId.takeIf { it.isNotBlank() }?.let { api.job(paired, it) }
            val current = runCatching { api.current(paired) }.getOrElse { if (result == null) throw it else null }
            RestoreResult(paired, items, result, current)
        }) { restored ->
            restoring = true
            lesson.removeAllItems(); restored.lessons.forEach { lesson.addItem(it) }
            for (index in 0 until lesson.itemCount) if (lesson.getItemAt(index).target.stageId == saved.stageId) lesson.selectedIndex = index
            restoring = false
            binding = restored.binding; connected = true
            allowedFiles = if (saved.jobFiles().isNotEmpty()) saved.jobFiles() else restored.current?.files.orEmpty()
            previewText.text = "已恢复配对的允许文件\n\n" + allowedFiles.joinToString("\n") { it.path }
            if (saved.pendingSubmissionId.isNotBlank() && saved.pendingKey.isNotBlank()) {
                pendingSnapshot = CodeSnapshot(saved.pendingSubmissionId, saved.pendingDigest, saved.pendingFiles())
                pendingKey = saved.pendingKey
            }
            if (restored.job != null) showJob(restored.job) else status.text = "已恢复当前工程配对，可以提交检查。"
            poll.start()
        }
    }
    private data class RestoreResult(val binding: WorkspaceBinding, val lessons: List<LessonChoice>, val job: CheckJob?, val current: WorkspacePreview?)
    private fun <T : Any> background(title: String, work: () -> T, success: (T) -> Unit) {
        busy = true; status.text = "$title…"; updateButtons()
        object : Task.Backgroundable(project, title, false) {
            private var value: T? = null
            override fun run(indicator: ProgressIndicator) { value = work() }
            override fun onSuccess() {
                if (project.isDisposed || disposed) return
                busy = false; value?.let(success); updateButtons()
            }
            override fun onThrowable(error: Throwable) {
                if (project.isDisposed || disposed) return
                busy = false; preview = null
                connected = false
                if (job != null) freshness.text = "连接中断，当前文件尚未核对；已保留原作业报告。"
                if (retryConnection && (error is java.io.IOException || error is InterruptedException)) poll.start() else poll.stop()
                status.text = if (error is java.io.IOException) "无法连接本机服务，已保留配对与作业。服务恢复后自动重连，也可点击恢复连接。" else (error.message ?: "操作未完成，请重试。") + " 可点击恢复连接，或重新预览并配对。"
                updateButtons()
            }
        }.queue()
    }
}
