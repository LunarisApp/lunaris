# Download Lunaris

- [Web app](https://web.lunaris.app) runs directly in the browser.
- [macOS installer](https://lunaris.app/download/macos) (`.dmg`) for Apple Silicon and Intel on macOS 13 or later.
- [Windows installer](https://lunaris.app/download/windows) (`.exe`) for 64-bit Intel and AMD computers.
- [Linux package](https://lunaris.app/download/linux) (`.deb`) for Debian and Ubuntu on 64-bit Intel and AMD computers.

## CLI

The CLI connects to Lunaris servers and the desktop app.

### macOS and Linux

Run in Bash on macOS 13 or later (Apple Silicon or Intel), or on x64 or ARM64 Linux with glibc 2.39 or later.

```sh
curl -fsSL https://lunaris.app/cli/install.sh | bash
```

The script installs to `~/.local/bin` by default. Add that directory to `PATH` if needed.

### Windows

Run in PowerShell on Windows x64, or on Windows 11 on Arm with x64 emulation.

```powershell
& ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing 'https://lunaris.app/cli/install.ps1')))
```

The script installs to `%LOCALAPPDATA%\Lunaris\bin` and adds it to your user `PATH`.

### Homebrew on macOS

```sh
brew install --formula lunarisapp/tap/lunaris
```

## Use the CLI

Run `lunaris --help` to explore commands. Use it to list workspaces, search resources, and script queries with JSON output. See the [CLI guide](https://github.com/LunarisApp/lunaris/blob/main/apps/cli/README.md) for sign-in, usage, and building from source.
