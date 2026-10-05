import type { Release } from "./releases";

/**
 * One-line installers for NGA Desktop (the /apps page's "install without
 * warnings"):
 *   macOS:   curl -fsSL https://api.amashuri.com/desktop/install.sh | sh
 *   Windows: irm https://api.amashuri.com/desktop/install.ps1 | iex
 *
 * Browsers mark downloads as "from the internet", which is what makes
 * Gatekeeper / SmartScreen warn about an app that isn't commercially signed.
 * These scripts download over HTTPS from NGA's own API instead, and only
 * install a file whose SHA-256 matches the published release.json; anything
 * else stops the install. The download still goes through
 * /desktop/download/:platform, so it is counted.
 */

const SAFE_VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const SAFE_FILE = /^[0-9A-Za-z._+-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const apiBase = () => (process.env.DESKTOP_API_URL || "https://api.amashuri.com").replace(/\/+$/, "");

/** The values a script embeds, checked so nothing unexpected reaches a shell. */
function pinned(release: Release | null, platform: "macos" | "windows") {
  const f = release?.downloads[platform];
  if (!release || !f || !SAFE_VERSION.test(release.version) || !SAFE_FILE.test(f.file) || !SHA256.test(f.sha256)) return null;
  return { version: release.version, file: f.file, sha256: f.sha256, size: f.size };
}

export function macInstallScript(release: Release | null): string {
  const p = pinned(release, "macos");
  if (!p) return `#!/bin/sh\necho "NGA Desktop for macOS isn't available yet. Try again later, or open https://mis.amashuri.com/apps" >&2\nexit 1\n`;
  return `#!/bin/sh
# NGA Desktop ${p.version} for macOS: https://mis.amashuri.com/apps
#   curl -fsSL ${apiBase()}/desktop/install.sh | sh
# Downloads NGA from NGA's server, checks its SHA-256, installs it into
# Applications (your own Applications folder if you can't write to the main
# one) and opens it. No admin password needed.
set -eu

VERSION="${p.version}"
SHA256="${p.sha256}"
URL="${apiBase()}/desktop/download/macos?src=terminal"

say() { printf '%s\\n' "$*"; }
fail() { printf 'NGA install stopped: %s\\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS. On Windows use PowerShell: irm ${apiBase()}/desktop/install.ps1 | iex"

TMP="$(mktemp -d)"
MNT=""
cleanup() { [ -n "$MNT" ] && hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

say "Downloading NGA Desktop $VERSION..."
curl -fL --progress-bar -o "$TMP/NGA.dmg" "$URL" || fail "the download failed. Check your internet connection and try again."

say "Checking the download..."
GOT="$(shasum -a 256 "$TMP/NGA.dmg" | awk '{print $1}')"
[ "$GOT" = "$SHA256" ] || fail "the downloaded file doesn't match NGA's published checksum, so it was not installed."

MNT="$(hdiutil attach -nobrowse -readonly -noautoopen "$TMP/NGA.dmg" | awk -F '\\t' '/\\/Volumes\\// {print $NF; exit}')"
[ -n "$MNT" ] && [ -d "$MNT/NGA.app" ] || fail "couldn't open the downloaded disk image."

DEST="/Applications"
if [ ! -w "$DEST" ]; then DEST="$HOME/Applications"; mkdir -p "$DEST"; fi

# Close a running NGA so it can be replaced.
osascript -e 'tell application id "com.amashuri.nga.desktop" to quit' >/dev/null 2>&1 || true
sleep 1

say "Installing into $DEST..."
rm -rf "$DEST/NGA.app"
ditto "$MNT/NGA.app" "$DEST/NGA.app"
xattr -dr com.apple.quarantine "$DEST/NGA.app" >/dev/null 2>&1 || true

say "Done: NGA Desktop $VERSION is installed. Opening it..."
open "$DEST/NGA.app"
say "Sign in to NGA MIS once; Task Mentor, Tendo and Tupo follow. NGA updates itself from now on."
`;
}

export function windowsInstallScript(release: Release | null): string {
  const p = pinned(release, "windows");
  if (!p) return `Write-Host "NGA Desktop for Windows isn't available yet. Try again later, or open https://mis.amashuri.com/apps" -ForegroundColor Yellow\n`;
  return `# NGA Desktop ${p.version} for Windows: https://mis.amashuri.com/apps
#   irm ${apiBase()}/desktop/install.ps1 | iex
# Downloads NGA from NGA's server, checks its SHA-256, installs it for this
# Windows user (no admin rights needed) and opens it.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

  $version = '${p.version}'
  $sha256 = '${p.sha256}'
  $url = '${apiBase()}/desktop/download/windows?src=powershell'
  $setup = Join-Path $env:TEMP "NGA-$version-setup.exe"

  try {
    Write-Host "Downloading NGA Desktop $version..."
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $setup

    Write-Host "Checking the download..."
    $got = (Get-FileHash -Algorithm SHA256 -Path $setup).Hash.ToLowerInvariant()
    if ($got -ne $sha256) { throw "the downloaded file doesn't match NGA's published checksum, so it was not installed." }

    # Close a running NGA so it can be replaced.
    Get-Process -Name 'NGA' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    Write-Host "Installing..."
    $p = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "the installer exited with code $($p.ExitCode)." }

    $exe = Join-Path $env:LOCALAPPDATA 'NGA\\NGA.exe'
    if (-not (Test-Path $exe)) { throw "NGA wasn't found after installing." }
    Write-Host "Done: NGA Desktop $version is installed. Opening it..." -ForegroundColor Green
    Start-Process -FilePath $exe
    Write-Host "Sign in to NGA MIS once; Task Mentor, Tendo and Tupo follow. NGA updates itself from now on."
  } catch {
    Write-Host "NGA install stopped: $($_.Exception.Message)" -ForegroundColor Red
  } finally {
    Remove-Item -Path $setup -Force -ErrorAction SilentlyContinue
  }
}
`;
}
