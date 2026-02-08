# Yolium Desktop -- Installation Guide

This guide walks you through downloading, verifying, and installing Yolium Desktop on your system. No prior experience required.

## What is Yolium Desktop?

Yolium Desktop is a desktop app that lets you run AI coding agents (like Claude Code) in isolated Docker containers. Each agent gets its own workspace, so you can run multiple agents in parallel without them stepping on each other's files.

---

## Prerequisites

Before installing Yolium Desktop, you need Docker running on your machine:

| Platform | Docker Requirement |
|----------|-------------------|
| **Windows** | [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) |
| **Linux** | [Docker Engine](https://docs.docker.com/engine/install/) (Docker Desktop is **not** needed) |
| **macOS** | [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) |

> **Tip:** Don't worry if Docker isn't installed yet. Yolium will guide you through Docker setup on first launch.

---

## Release Assets Explained

When you go to the [Releases page](https://github.com/yolium-ai/yolium/releases), you'll see several files. Here's what each one is for:

### Installers (pick the one for your OS)

| File | Platform | What It Does |
|------|----------|-------------|
| **`Yolium.Desktop-0.1.5.Setup.exe`** | Windows | Standard Windows installer. Double-click to install like any other app. |
| **`yolium-desktop_0.1.5_amd64.deb`** | Linux (Ubuntu, Debian, Mint, Pop!_OS) | Debian package. Install with `dpkg` or your package manager. |
| **`yolium-desktop-0.1.5-1.x86_64.rpm`** | Linux (Fedora, RHEL, openSUSE) | RPM package. Install with `dnf` or `rpm`. |
| **`yolium-desktop-0.1.5-1-x86_64.pkg.tar.zst`** | Linux (Arch, Manjaro, EndeavourOS) | Arch Linux package. Install with `pacman`. |

### Other Files

| File | What It Is |
|------|-----------|
| **`checksums-sha256.txt`** | Contains SHA-256 hashes for every file in the release. Use this to verify your download wasn't corrupted or tampered with (see below). |
| **`RELEASES`** | Metadata file used by the Windows auto-updater (Squirrel). You don't need to download this manually. |
| **`yolium_desktop-0.1.5-full.nupkg`** | Windows update package used internally by the auto-updater (Squirrel/NuGet format). You don't need to download this manually. |

---

## Step 1: Download

Go to the [latest release](https://github.com/yolium-ai/yolium/releases/latest) and download the installer for your operating system.

---

## Step 2: Verify Your Download (Optional but Recommended)

Verifying the checksum ensures the file you downloaded is exactly what was published -- not corrupted during download or tampered with.

### What is a checksum?

A checksum is a unique fingerprint for a file. If even a single byte changes, the checksum will be completely different. By comparing the checksum of your downloaded file against the one published in `checksums-sha256.txt`, you can confirm the file is authentic and intact.

### How to verify

**1. Download `checksums-sha256.txt` from the release page.**

**2. Generate the checksum of your downloaded installer:**

**Windows (PowerShell):**
```powershell
Get-FileHash .\Yolium.Desktop-0.1.5.Setup.exe -Algorithm SHA256
```

**Linux:**
```bash
sha256sum yolium-desktop_0.1.5_amd64.deb
```

**macOS:**
```bash
shasum -a 256 Yolium.Desktop-0.1.5.Setup.exe
```

**3. Compare the output to the matching line in `checksums-sha256.txt`.** They should match exactly.

For reference, the checksums for v0.1.5 are:

```
cfc1400713eedfee28db70ce3bec1a24a6055f1f540f1703ff0c1310e062f62f  yolium-desktop_0.1.5_amd64.deb
6afb3fc4949e45475922dcb79da90ed667a98451c9b7e0bfcc8a9c3ab2a1b5b8  yolium-desktop-0.1.5-1.x86_64.rpm
5111285082008cb023e1a01e09c944972b5ef488ddb64f6ceb5e3708cd957b41  Yolium.Desktop-0.1.5.Setup.exe
```

> **Arch Linux users:** The `.pkg.tar.zst` checksum is also included in `checksums-sha256.txt` on the release page. Verify it the same way using `sha256sum`.

> If the checksums don't match, delete the file and download it again. If the problem persists, report it as an issue.

---

## Step 3: Install

### Windows

1. Double-click **`Yolium.Desktop-0.1.5.Setup.exe`**
2. Follow the installer prompts
3. Yolium Desktop will launch automatically after installation
4. Future updates are handled automatically via the built-in updater

### Linux (Ubuntu / Debian / Mint / Pop!_OS)

```bash
sudo dpkg -i yolium-desktop_0.1.5_amd64.deb
```

If you get dependency errors, fix them with:

```bash
sudo apt-get install -f
```

Then launch from your application menu or run:

```bash
yolium-desktop
```

### Linux (Fedora / RHEL / openSUSE)

```bash
sudo dnf install ./yolium-desktop-0.1.5-1.x86_64.rpm
```

Or with `rpm` directly:

```bash
sudo rpm -i yolium-desktop-0.1.5-1.x86_64.rpm
```

Then launch from your application menu or run:

```bash
yolium-desktop
```

### Linux (Arch / Manjaro / EndeavourOS)

#### From the release package

```bash
sudo pacman -U yolium-desktop-0.1.5-1-x86_64.pkg.tar.zst
```

#### Building from the PKGBUILD

If you prefer to build from source, the repository includes a `PKGBUILD` in the `build/` directory:

```bash
git clone https://github.com/yolium-ai/yolium.git
cd yolium

# Install dependencies and build the Electron app
npm ci
npx electron-rebuild --only node-pty
npm run make

# Prepare the Arch package sources
VERSION=$(node -p "require('./package.json').version")
mkdir -p arch-pkg
tar czf "arch-pkg/yolium-desktop-${VERSION}.tar.gz" -C out "Yolium Desktop-linux-x64"
cp build/yolium-desktop.desktop arch-pkg/
cp assets/icon/web-app-manifest-512x512.png arch-pkg/yolium-desktop.png
sed "s/__VERSION__/${VERSION}/" build/PKGBUILD > arch-pkg/PKGBUILD

# Build and install
cd arch-pkg
makepkg -si
```

Then launch from your application menu or run:

```bash
yolium-desktop
```

> **Note:** The PKGBUILD installs binaries to `/opt/yolium-desktop` and creates a symlink at `/usr/bin/yolium-desktop`. Runtime dependencies (`gtk3`, `nss`, `alsa-lib`, `libxss`, `libxtst`) are installed automatically by `pacman`.

---

## Step 4: First Launch

1. **Docker check** -- Yolium will detect whether Docker is running. If it isn't, it will guide you through setting it up.
2. **Git settings** -- Configure your name, email, and optionally a GitHub Personal Access Token (PAT) for private repos. For Claude Code authentication, choose between an Anthropic API key or Claude Max OAuth (if you have a Claude Max subscription and `~/.claude/.credentials.json` on your host).
3. **Create a session** -- Click the **+** button, select a project folder, and choose an AI agent to start working.

---

## Uninstalling

### Windows

Use **Settings > Apps > Installed Apps**, find Yolium Desktop, and click **Uninstall**.

### Linux (Debian/Ubuntu)

```bash
sudo apt remove yolium-desktop
```

### Linux (Fedora/RHEL)

```bash
sudo dnf remove yolium-desktop
```

### Linux (Arch/Manjaro)

```bash
sudo pacman -Rns yolium-desktop
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Installer won't run on Windows | Right-click > **Run as administrator** |
| "Docker not found" on first launch | Make sure Docker is installed and running. On Linux, ensure your user is in the `docker` group: `sudo usermod -aG docker $USER` (then log out and back in). |
| Dependency errors on Linux (Debian/Ubuntu) | Run `sudo apt-get install -f` after installing the `.deb` package. |
| Dependency errors on Linux (Arch) | Ensure `gtk3`, `nss`, `alsa-lib`, `libxss`, and `libxtst` are installed: `sudo pacman -S gtk3 nss alsa-lib libxss libxtst`. |
| Checksum doesn't match | Delete the file and re-download. If it still doesn't match, open an issue on GitHub. |

---

## Getting Help

If you run into problems, [open an issue on GitHub](https://github.com/yolium-ai/yolium/issues).
