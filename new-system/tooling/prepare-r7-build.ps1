param([string]$Name='r7-final-build')
$ErrorActionPreference='Stop'
if($Name -notmatch '^r7-[a-z0-9-]+$'){throw 'Use an R7 build-directory name.'}
$systemDirectory=Split-Path $PSScriptRoot -Parent
$buildDirectory=Join-Path $systemDirectory "runtime/$Name"
if(Test-Path -LiteralPath $buildDirectory){throw 'Choose an unused build directory to preserve previous evidence.'}
New-Item -ItemType Directory -Path $buildDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $systemDirectory 'backend/src') -Destination $buildDirectory -Recurse
$pom=[IO.File]::ReadAllText((Join-Path $systemDirectory 'backend/pom.xml'))
# The copy has isolated compiler output; existing tests retain their documented cwd.
$workingDirectory=[Security.SecurityElement]::Escape((Join-Path $systemDirectory 'backend').Replace('\','/'))
$pom=$pom.Replace('<configuration><argLine>',"<configuration><workingDirectory>$workingDirectory</workingDirectory><argLine>")
[IO.File]::WriteAllText((Join-Path $buildDirectory 'pom.xml'),$pom,[Text.UTF8Encoding]::new($false))
Write-Output $buildDirectory
