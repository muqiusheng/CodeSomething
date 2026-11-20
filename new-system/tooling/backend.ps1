param([ValidateSet('test','package','run')][string]$Action='test',[switch]$SkipTests,[string]$TestName)
$ErrorActionPreference='Stop'
$systemRoot=Split-Path $PSScriptRoot -Parent
$jdkCandidates=@($env:CS_JAVA_HOME,'C:/Program Files (x86)/jdk/jdk21')
$javaDirectory=$jdkCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin/javac.exe')) } | Select-Object -First 1
if(-not $javaDirectory){throw 'Set CS_JAVA_HOME to a JDK21 installation.'}
$mavenCandidates=@($env:CS_MAVEN_HOME,'D:/Download/apache-maven-3.9.14')
$mavenDirectory=$mavenCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin/mvn.cmd')) } | Select-Object -First 1
if(-not $mavenDirectory){throw 'Set CS_MAVEN_HOME to a Maven3.9 installation.'}
$env:JAVA_HOME=$javaDirectory
$env:Path=(Join-Path $javaDirectory 'bin')+';'+$env:Path
$runtimeDirectory=Join-Path $systemRoot 'runtime'
New-Item -ItemType Directory -Force (Join-Path $runtimeDirectory 'data') | Out-Null
$env:CS_DATA_DIRECTORY=Join-Path $runtimeDirectory 'data'
if(-not $env:CS_IDEA_EXECUTABLE){
    $ideDirectory=if($env:CS_IDEA_HOME){$env:CS_IDEA_HOME}else{'D:/Download/IntelliJ IDEA 2026.2'}
    $candidate=Join-Path $ideDirectory 'bin/idea64.exe'
    if(Test-Path -LiteralPath $candidate){$env:CS_IDEA_EXECUTABLE=$candidate}
}
$arguments=@('-B','-ntp','-s',(Join-Path $PSScriptRoot 'maven-settings.xml'),"-Dmaven.repo.local=$(Join-Path $runtimeDirectory 'maven-repository')",'-f',(Join-Path $systemRoot 'backend/pom.xml'))
if($Action -eq 'run'){$arguments+='spring-boot:run'}else{$arguments+=$Action}
if($SkipTests){$arguments+='-DskipTests'}
if($TestName){$arguments+="-Dtest=$TestName"}
Push-Location $systemRoot
try { & (Join-Path $mavenDirectory 'bin/mvn.cmd') @arguments; $resultCode=$LASTEXITCODE } finally { Pop-Location }
exit $resultCode
