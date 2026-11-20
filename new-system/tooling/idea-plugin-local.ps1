param([ValidateSet('test','build')][string]$Action='test')
$ErrorActionPreference = 'Stop'
$systemDirectory = Split-Path $PSScriptRoot -Parent
$pluginDirectory = Join-Path $systemDirectory 'idea-plugin'
$ideDirectory = $env:CS_IDEA_HOME
if (-not $ideDirectory) { $ideDirectory = 'D:/Download/IntelliJ IDEA 2026.2' }
$ideDirectory = (Resolve-Path -LiteralPath $ideDirectory).Path
$javaExe = Join-Path $ideDirectory 'jbr/bin/java.exe'
$javacExe = Join-Path $ideDirectory 'jbr/bin/javac.exe'
$compilerDirectory = Join-Path $ideDirectory 'plugins/Kotlin/kotlinc/lib'
$buildDirectory = Join-Path $pluginDirectory ('build/local/' + $Action + '-' + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $buildDirectory 'classes'
New-Item -ItemType Directory -Force $classes | Out-Null
$platformJars = @(Get-ChildItem -LiteralPath (Join-Path $ideDirectory 'lib') -Filter '*.jar' | Select-Object -ExpandProperty FullName)
$compilerJars = @('kotlin-stdlib.jar','kotlin-stdlib-jdk7.jar','kotlin-stdlib-jdk8.jar','annotations-13.0.jar') | ForEach-Object { Join-Path $compilerDirectory $_ }
$testJars = @()
if ($Action -eq 'test') {
    foreach ($item in @('org/junit','org/opentest4j','org/apiguardian')) {
        $testJars += Get-ChildItem -LiteralPath (Join-Path $systemDirectory "runtime/maven-repository/$item") -Recurse -Filter '*.jar' | Where-Object { $_.FullName -notmatch '1\.12\.2' } | Select-Object -ExpandProperty FullName
    }
}
$classpath = (@($platformJars) + @($compilerJars) + @($testJars) + @($classes)) -join ';'
$sources = @(Get-ChildItem -LiteralPath (Join-Path $pluginDirectory 'src/main/kotlin') -Recurse -Filter '*.kt' | Select-Object -ExpandProperty FullName)
if ($Action -eq 'test') { $sources += Get-ChildItem -LiteralPath (Join-Path $pluginDirectory 'src/test/kotlin') -Recurse -Filter '*.kt' | Select-Object -ExpandProperty FullName }
$compilerArguments = @('-no-stdlib','-no-reflect','-jvm-target','25','-classpath',$classpath,'-d',$classes) + $sources
$argumentFile = Join-Path $buildDirectory 'compiler-args.txt'
$compilerArguments | ForEach-Object { '"' + $_.Replace('\','/') + '"' } | Set-Content -LiteralPath $argumentFile -Encoding utf8NoBOM
& $javaExe -Xmx2g -cp "$compilerDirectory/*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler "@$argumentFile"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Action -eq 'test') {
    $launcher = Join-Path $pluginDirectory 'src/test/java/dev/codesomething/idea/TestLauncher.java'
    $javacArguments = @('-encoding','UTF-8','-cp',$classpath,'-d',$classes,$launcher)
    $javacFile = Join-Path $buildDirectory 'javac-args.txt'
    $javacArguments | ForEach-Object { '"' + $_.Replace('\','/') + '"' } | Set-Content -LiteralPath $javacFile -Encoding utf8NoBOM
    & $javacExe "@$javacFile"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $javaArguments = @('-cp',$classpath,'dev.codesomething.idea.TestLauncher')
    $javaFile = Join-Path $buildDirectory 'java-args.txt'
    $javaArguments | ForEach-Object { '"' + $_.Replace('\','/') + '"' } | Set-Content -LiteralPath $javaFile -Encoding utf8NoBOM
    & $javaExe "@$javaFile"
    exit $LASTEXITCODE
}
$distributionDirectory = Join-Path $pluginDirectory 'build/distributions'
$stagingDirectory = Join-Path $buildDirectory 'staging/codesomething/lib'
New-Item -ItemType Directory -Force $distributionDirectory,$stagingDirectory | Out-Null
$pluginVersion = ([xml](Get-Content -LiteralPath (Join-Path $pluginDirectory 'src/main/resources/META-INF/plugin.xml') -Raw)).'idea-plugin'.version
$jar = Join-Path $stagingDirectory "codesomething-idea-$pluginVersion.jar"
& 'C:/Program Files (x86)/jdk/jdk21/bin/jar.exe' --create --file $jar -C $classes . -C (Join-Path $pluginDirectory 'src/main/resources') .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$distribution = Join-Path $distributionDirectory "codesomething-idea-$pluginVersion.zip"
Compress-Archive -LiteralPath (Split-Path $stagingDirectory -Parent) -DestinationPath $distribution -Force
$jar | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/idea-plugin-jar.txt') -Encoding utf8NoBOM
$distribution | Set-Content -LiteralPath (Join-Path $systemDirectory 'runtime/idea-plugin-path.txt') -Encoding utf8NoBOM
Write-Output "Plugin compiled against $ideDirectory"
Write-Output "Installable plugin: $distribution"
