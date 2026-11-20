# Self-host Lunaris Community Edition

Deploy Community Edition with Docker Compose to run writing, collaboration, sync, and file storage on infrastructure you manage.

## Requirements

- An AMD64 or ARM64 Linux server with at least 4 GB of RAM and enough disk space for data and backups.
- Docker Engine, Docker Compose 2.24 or later, curl, and OpenSSL.
- For a public deployment, a domain pointing to the server and TCP ports 80 and 443 open for automatic HTTPS.

## Install Community Edition

### macOS and Linux

Run the installer on your Linux server. To evaluate locally on macOS, install Docker Desktop and run the same command.

```sh
curl -fsSL https://lunaris.app/self-hosted/install.sh | bash
```

The installer uses `./lunaris` by default.

### Windows (WSL 2)

Make Docker Compose 2.24 or later, curl, and OpenSSL available in your default WSL 2 Linux distribution. Run the installer in PowerShell.

```powershell
& ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing 'https://lunaris.app/self-hosted/install.ps1')))
```

The installer uses `~/lunaris` inside WSL. Use that Linux distribution to manage the services.

On first install, enter your domain or public URL when prompted. For local evaluation, use `http://localhost:8080`. The installer downloads prebuilt images, generates secrets, and starts the services. Open the URL it prints and create an account.

## Operate your server

You manage updates, backups, access, and availability. Back up the data volumes and `.env` secrets. Configure email for password resets and invitations, and review registration settings before sharing the server.

## Licensing

Community Edition is available under MIT. Enterprise features have a separate proprietary license, and third-party components retain their own terms.

- [Deployment and maintenance guide](https://github.com/LunarisApp/lunaris/blob/main/infra/self-host/README.md)
- [Licensing details](https://github.com/LunarisApp/lunaris#license)
- [Lunaris Cloud pricing](https://lunaris.app/pricing.md)
