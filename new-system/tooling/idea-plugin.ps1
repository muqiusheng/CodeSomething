param([ValidateSet('test','build')][string]$Action='test')
$ErrorActionPreference = 'Stop'
$systemDirectory = Split-Path $PSScriptRoot -Parent
$pluginDirectory = Join-Path $systemDirectory 'idea-plugin'
$previousEnvironment = @{}
foreach ($name in @('JAVA_HOME','CS_IDEA_HOME','GRADLE_USER_HOME')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
    if (-not $env:CS_IDEA_HOME) { $env:CS_IDEA_HOME = 'D:/Download/IntelliJ IDEA 2026.2' }
    $env:CS_IDEA_HOME = (Resolve-Path -LiteralPath $env:CS_IDEA_HOME).Path
    $env:JAVA_HOME = Join-Path $env:CS_IDEA_HOME 'jbr'
    $env:GRADLE_USER_HOME = Join-Path $systemDirectory 'runtime/gradle-home'
    $gradle = Join-Path $systemDirectory 'runtime/toolchains/gradle-9.2.1/bin/gradle.bat'
    if (-not (Test-Path -LiteralPath $gradle)) { $gradle = Join-Path $pluginDirectory 'gradlew.bat' }
    $arguments = @('-p', $pluginDirectory, '--no-daemon')
    foreach ($protocol in @('http','https')) {
        $proxyValue = [Environment]::GetEnvironmentVariable($protocol.ToUpper() + '_PROXY')
        if ($proxyValue) {
            $proxyUri = [Uri]$proxyValue
            if ($proxyUri.UserInfo) { throw 'Configure authenticated proxies in your private Gradle properties; credentials are not passed on the command line.' }
            $arguments += "-D$protocol.proxyHost=$($proxyUri.Host)"
            $arguments += "-D$protocol.proxyPort=$($proxyUri.Port)"
        }
    }
    if ($Action -eq 'build') { $arguments += @('test','buildPlugin','verifyPluginStructure') }
    else { $arguments += 'test' }
    & $gradle @arguments
    $resultCode = $LASTEXITCODE
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name])
    }
}
exit $resultCode
