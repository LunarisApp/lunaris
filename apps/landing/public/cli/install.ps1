$ErrorActionPreference = 'Stop'

function Add-LunarisToUserPath([string]$Directory) {
    $environment = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
    try {
        # Keep expandable entries such as %USERPROFILE% intact.
        $userPath = $environment.GetValue('Path', $null, 'DoNotExpandEnvironmentNames')
        $kind = if ($null -eq $userPath) { 'ExpandString' } else { $environment.GetValueKind('Path') }
        $resolvedPath = $environment.GetValue('Path', '')
        if (($resolvedPath -split ';') -contains $Directory) { return }

        if (-not ('Lunaris.EnvironmentChange' -as [type])) {
            Add-Type -Namespace Lunaris -Name EnvironmentChange -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern System.IntPtr SendMessageTimeout(
    System.IntPtr window, uint message, System.UIntPtr wParam, string lParam,
    uint flags, uint timeout, out System.UIntPtr result);
'@
        }
        $newPath = (@($userPath, $Directory) | Where-Object { $_ }) -join ';'
        $environment.SetValue('Path', $newPath, $kind)
        # Notify Explorer and other applications that launch new terminals.
        $result = [UIntPtr]::Zero
        [void][Lunaris.EnvironmentChange]::SendMessageTimeout([IntPtr]::new(0xffff), 0x001a, [UIntPtr]::Zero, 'Environment', 2, 1000, [ref]$result)
    } finally {
        $environment.Dispose()
    }
}

if (-not [Environment]::Is64BitOperatingSystem -or
    [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -notin @('X64', 'Arm64')) {
    throw 'The Lunaris Windows CLI requires a 64-bit x64 PC or Windows 11 on Arm with x64 emulation.'
}

$releases = 'https://github.com/LunarisApp/lunaris/releases'
$manifest = Invoke-RestMethod -UseBasicParsing "$releases/latest/download/SHA256SUMS"
$assets = [regex]::Matches($manifest, '(?m)^([0-9a-f]{64})[ \t]+\*?(lunaris-cli-([0-9]+\.[0-9]+\.[0-9]+)-x86_64-pc-windows-msvc\.zip)\r?$')
if ($assets.Count -ne 1) {
    throw 'The latest Lunaris release must provide one Windows x64 CLI archive.'
}

$checksum = $assets[0].Groups[1].Value
$asset = $assets[0].Groups[2].Value
$version = $assets[0].Groups[3].Value
$work = Join-Path ([IO.Path]::GetTempPath()) ("lunaris-" + [guid]::NewGuid())
$installDir = Join-Path $env:LOCALAPPDATA 'Lunaris\bin'
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $archive = Join-Path $work $asset
    Invoke-WebRequest -UseBasicParsing "$releases/download/v$version/$asset" -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $checksum) {
        throw 'CLI archive checksum mismatch.'
    }

    $extracted = Join-Path $work 'extracted'
    Expand-Archive -LiteralPath $archive -DestinationPath $extracted
    foreach ($name in 'lunaris.exe', 'LICENSE', 'THIRD-PARTY-LICENSES.txt') {
        if (-not (Test-Path -LiteralPath (Join-Path $extracted $name) -PathType Leaf)) {
            throw "CLI archive is missing $name."
        }
    }
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $extracted 'LICENSE') -Destination (Join-Path $installDir 'lunaris-LICENSE.txt') -Force
    Copy-Item -LiteralPath (Join-Path $extracted 'THIRD-PARTY-LICENSES.txt') -Destination (Join-Path $installDir 'lunaris-THIRD-PARTY-LICENSES.txt') -Force
    Copy-Item -LiteralPath (Join-Path $extracted 'lunaris.exe') -Destination $installDir -Force

    Add-LunarisToUserPath $installDir
    if (($env:Path -split ';') -notcontains $installDir) {
        $env:Path += ";$installDir"
    }
    Write-Host "Installed Lunaris CLI $version to $installDir\lunaris.exe"
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force
}
