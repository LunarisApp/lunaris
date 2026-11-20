param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = 'Stop'
$releaseAsset = "lunaris-cli-$Version-x86_64-pc-windows-msvc.zip"
$releaseArchive = Join-Path (Resolve-Path 'dist') $releaseAsset
$releaseChecksum = (Get-FileHash -LiteralPath $releaseArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$archiveUrl = "https://github.com/LunarisApp/lunaris/releases/download/v$Version/$releaseAsset"

function Invoke-RestMethod {
    param([switch]$UseBasicParsing, [string]$Uri)
    if ($Uri -cne 'https://github.com/LunarisApp/lunaris/releases/latest/download/SHA256SUMS') {
        throw "Unexpected checksum URL $Uri."
    }
    "$releaseChecksum  $releaseAsset`r`n"
}

function Invoke-WebRequest {
    param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
    if ($Uri -cne $archiveUrl) {
        throw "Unexpected archive URL $Uri."
    }
    Copy-Item -LiteralPath $releaseArchive -Destination $OutFile
}

$installer = Join-Path $PSScriptRoot '../../apps/landing/public/cli/install.ps1'
$work = Join-Path $env:RUNNER_TEMP "CLI install $([guid]::NewGuid())"
$originalAppData = $env:LOCALAPPDATA
$originalPath = $env:Path
$environment = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
$originalUserPath = $environment.GetValue('Path', $null, 'DoNotExpandEnvironmentNames')
$originalKind = if ($null -ne $originalUserPath) { $environment.GetValueKind('Path') }
try {
    $env:LOCALAPPDATA = $work
    $existingEntry = '%USERPROFILE%\bin'
    $environment.SetValue('Path', $existingEntry, 'ExpandString')
    & $installer
    & $installer

    $directory = Join-Path $work 'Lunaris\bin'
    $expectedUserPath = "$existingEntry;$directory"
    if ($environment.GetValue('Path', $null, 'DoNotExpandEnvironmentNames') -cne $expectedUserPath -or
        $environment.GetValueKind('Path') -ne 'ExpandString') {
        throw 'Installer changed an existing PATH entry or added a duplicate.'
    }
    if (@($env:Path -split ';' | Where-Object { $_ -eq $directory }).Count -ne 1) {
        throw 'Lunaris is missing or duplicated in the current PowerShell PATH.'
    }
    $binary = Join-Path $directory 'lunaris.exe'
    $installedVersion = & $binary --version
    if ($LASTEXITCODE -ne 0 -or $installedVersion -notlike "lunaris $Version*") {
        throw "Unexpected installed CLI version $installedVersion."
    }

    $installedHash = (Get-FileHash -LiteralPath $binary).Hash
    $releaseChecksum = '0' * 64
    try {
        & $installer
        throw 'The installer accepted an incorrect checksum.'
    } catch {
        if ($_.Exception.Message -ne 'CLI archive checksum mismatch.') { throw }
    }
    if ((Get-FileHash -LiteralPath $binary).Hash -ne $installedHash) {
        throw 'The failed install changed the executable.'
    }
} finally {
    if ($null -eq $originalUserPath) {
        $environment.DeleteValue('Path', $false)
    } else {
        $environment.SetValue('Path', $originalUserPath, $originalKind)
    }
    $environment.Dispose()
    $env:Path = $originalPath
    $env:LOCALAPPDATA = $originalAppData
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
