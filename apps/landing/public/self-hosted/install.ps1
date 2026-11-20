# Run the self-hosted installer on the default WSL 2 Linux distribution.
$ErrorActionPreference = 'Stop'

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'Install WSL 2 and make Docker Compose available in your default Linux distribution.'
}

# Keep the installation in the Linux filesystem, where Bash can protect .env
# with Unix file permissions. WSL inherits the terminal for the domain prompt.
wsl.exe --cd '~' --exec bash -c 'set -o pipefail; curl -fsSL https://lunaris.app/self-hosted/install.sh | bash'
if ($LASTEXITCODE -ne 0) {
    throw "Lunaris self-hosted installation failed in WSL (exit $LASTEXITCODE)."
}
