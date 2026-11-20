param()
$ErrorActionPreference='Stop'
$systemDirectory=Split-Path $PSScriptRoot -Parent
$runDirectory=Join-Path $systemDirectory ('docs/acceptance/R3.4/runs/'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $runDirectory | Out-Null
$previousDocker=$env:CS_RUN_DOCKER_TESTS
$previousEvidence=$env:CS_BOOT_EVIDENCE_DIRECTORY
$previousFilter=$env:CS_BOOT_STAGE_FILTER
try {
    & node --test (Join-Path $PSScriptRoot 'tests/check-r34-release.test.mjs') *> (Join-Path $runDirectory 'gate-tests.log')
    if($LASTEXITCODE -ne 0){throw 'Release gate regression tests failed.'}
    $env:CS_RUN_DOCKER_TESTS='true'
    $env:CS_BOOT_EVIDENCE_DIRECTORY=Join-Path $runDirectory 'strategies'
    Remove-Item Env:CS_BOOT_STAGE_FILTER -ErrorAction SilentlyContinue
    # A fresh evidence directory and unfiltered successful JUnit run are mandatory.
    & (Join-Path $PSScriptRoot 'backend.ps1') -Action test -TestName BootStrategyRunnerTest *> (Join-Path $runDirectory 'strategies.log')
    if($LASTEXITCODE -ne 0){throw 'Isolated strategy checks failed; release rejected.'}
    & node (Join-Path $PSScriptRoot 'checks/check-r34-release.mjs') --evidence $env:CS_BOOT_EVIDENCE_DIRECTORY *> (Join-Path $runDirectory 'gate.json')
    if($LASTEXITCODE -ne 0){throw 'Release inputs or runtime evidence rejected.'}
    Write-Output "Release checks passed: $runDirectory"
} finally {
    $env:CS_RUN_DOCKER_TESTS=$previousDocker
    $env:CS_BOOT_EVIDENCE_DIRECTORY=$previousEvidence
    $env:CS_BOOT_STAGE_FILTER=$previousFilter
}
