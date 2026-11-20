package dev.codesomething.idea

import java.nio.file.Files
import java.nio.file.Path

data class ReportLocation(val path: String, val line: Int, val column: Int) {
    override fun toString() = "$path:$line:$column"
}

object ReportLocations {
    private val compiler = Regex("([A-Za-z0-9_./\\\\:-]+\\.java):(?:\\[(\\d+),(\\d+)\\]|(\\d+)(?::(\\d+))?)")
    private val stack = Regex("\\(([A-Za-z0-9_$-]+\\.java):(\\d+)\\)")

    fun resolve(root: Path, allowed: List<AllowedFile>, location: ReportLocation): Path? {
        if (location.line < 1 || location.column < 1 || allowed.none { it.path == location.path }) return null
        return runCatching {
            val base = root.toRealPath()
            val relative = Path.of(location.path)
            if (relative.isAbsolute || relative.any { it.toString() == ".." }) return null
            val path = base.resolve(relative).normalize()
            if (!path.startsWith(base) || !Files.isRegularFile(path) || path.toRealPath() != path) null else path
        }.getOrNull()
    }

    fun find(root: Path, allowed: List<AllowedFile>, log: String): List<ReportLocation> {
        val result = mutableListOf<ReportLocation>()
        fun add(raw: String, line: String, column: String) {
            val normalized = raw.replace('\\', '/')
            if (normalized.split('/').contains("..")) return
            val matches = allowed.filter { normalized == it.path || normalized.endsWith("/${it.path}") ||
                (!normalized.contains('/') && it.path.substringAfterLast('/') == normalized) }
            if (matches.size != 1) return
            val location = ReportLocation(matches.single().path, line.toIntOrNull() ?: return, column.toIntOrNull() ?: 1)
            if (resolve(root, allowed, location) != null) result.add(location)
        }
        log.lineSequence().forEach { line ->
            compiler.findAll(line).forEach { add(it.groupValues[1], it.groupValues[2].ifEmpty { it.groupValues[4] }, it.groupValues[3].ifEmpty { it.groupValues[5] }) }
            stack.findAll(line).forEach { add(it.groupValues[1], it.groupValues[2], "1") }
        }
        return result.distinct()
    }
}
