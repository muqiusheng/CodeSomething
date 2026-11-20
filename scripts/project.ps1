param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('frontend-dev','frontend-build','frontend-test','backend-dev','backend-test','idea-test','idea-build','release-check','r7-release-check','research-check','r8-test')]
    [string]$Task
)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$systemDirectory = Join-Path $projectDirectory 'new-system'
Push-Location $projectDirectory
try {
    switch ($Task) {
        'r8-test' {
            $previousDockerTests=$env:CS_RUN_DOCKER_TESTS
            $previousMutationOnly=$env:CS_R8_MUTATION_ONLY
            try {
                $env:CS_RUN_DOCKER_TESTS='true'
                $env:CS_R8_MUTATION_ONLY='false'
                & (Join-Path $systemDirectory 'tooling/backend.ps1') -Action test -TestName 'PortfolioApiTest,PortfolioFlowTest,PortfolioIsolationTest,PortfolioRunnerTest'
            } finally {
                $env:CS_RUN_DOCKER_TESTS=$previousDockerTests
                $env:CS_R8_MUTATION_ONLY=$previousMutationOnly
            }
        }
        'r7-release-check' {
            & node --test (Join-Path $systemDirectory 'tooling/tests/check-r7-release.test.mjs')
            if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
            & node (Join-Path $systemDirectory 'tooling/checks/check-r7-release.mjs')
        }
        'research-check' {
            & node --test (Join-Path $systemDirectory 'tooling/tests/check-r61-research.test.mjs')
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            & node (Join-Path $systemDirectory 'tooling/checks/check-r61-research.mjs')
        }
        'frontend-dev' { & npm --prefix (Join-Path $systemDirectory 'frontend') run dev }
        'frontend-build' { & npm --prefix (Join-Path $systemDirectory 'frontend') run build }
        'frontend-test' { & npm --prefix (Join-Path $systemDirectory 'frontend') test }
        'backend-dev' { & (Join-Path $systemDirectory 'tooling/backend.ps1') -Action run }
        'backend-test' { & (Join-Path $systemDirectory 'tooling/backend.ps1') -Action test }
        'idea-test' { & (Join-Path $systemDirectory 'tooling/idea-plugin-local.ps1') -Action test }
        'idea-build' { & (Join-Path $systemDirectory 'tooling/idea-plugin-local.ps1') -Action build }
        'release-check' {
            & node --test (Join-Path $systemDirectory 'tooling/tests/check-r34-release.test.mjs')
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            & node (Join-Path $systemDirectory 'tooling/checks/check-r34-release.mjs')
            if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
            if(Test-Path -LiteralPath (Join-Path $systemDirectory 'curriculum/r7-release-lock.json')){
                & node --test (Join-Path $systemDirectory 'tooling/tests/check-r7-release.test.mjs')
                if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
                & node (Join-Path $systemDirectory 'tooling/checks/check-r7-release.mjs')
            }
        }
    }
    $resultCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $resultCode
