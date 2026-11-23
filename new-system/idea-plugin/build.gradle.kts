plugins {
    kotlin("jvm") version "2.3.20"
    id("org.jetbrains.intellij.platform") version "2.20.1"
}

group = "dev.codesomething"
version = "0.3.2"

repositories {
    // Reuse project-local artifacts when the backend toolchain has prepared them.
    val preparedRepository = file("../runtime/maven-repository")
    if (preparedRepository.isDirectory) maven { url = uri(preparedRepository) }
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        local(providers.environmentVariable("CS_IDEA_HOME").get())
    }
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testImplementation("com.google.code.gson:gson:2.13.2")
    testImplementation("org.junit.platform:junit-platform-launcher")
}

kotlin { jvmToolchain(25) }
tasks.test { useJUnitPlatform() }

// The plugin contains native Swing/Kotlin code and no .form files. Kotlin emits its own null checks.
intellijPlatform {
    instrumentCode = false
    pluginConfiguration {
        id = "dev.codesomething.idea"
        name = "Maqibu"
        version = project.version.toString()
        ideaVersion { sinceBuild = "262"; untilBuild = "262.*" }
    }
}
