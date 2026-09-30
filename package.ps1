# Builds the frontend and packages a Decky-installable zip: out/DeckyD4Builds-v<version>.zip
# The version comes from package.json. The folder inside the zip stays "DeckyD4Builds" so a new zip
# installs over the old one instead of as a second plugin.
# Layout inside the zip: DeckyD4Builds/{dist/index.js, main.py, plugin.json, package.json, LICENSE, README.md}
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$env:PATH = "$root\.tools\node;$env:PATH"

$version = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
$zip = "$root\out\DeckyD4Builds-v$version.zip"

Push-Location $root
try {
  if (-not (Test-Path "$root\node_modules")) { npm install --no-audit --no-fund }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed" }

  $stage = "$root\out\stage"
  $pkg = "$stage\DeckyD4Builds"
  # keep zips of earlier versions; only replace this version's zip and the staging folder
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  if (Test-Path $zip) { Remove-Item -Force $zip }
  New-Item -ItemType Directory -Force "$pkg\dist" | Out-Null
  Copy-Item "$root\dist\index.js" "$pkg\dist\"
  foreach ($f in "main.py", "plugin.json", "package.json", "LICENSE", "README.md") { Copy-Item "$root\$f" "$pkg\" }

  # bsdtar (Windows 10+) writes zip entries with forward slashes, which Linux/Decky expects
  Push-Location $stage
  & "$env:SystemRoot\System32\tar.exe" -a -c -f $zip DeckyD4Builds
  Pop-Location
  if ($LASTEXITCODE -ne 0) { throw "zip failed" }
  Remove-Item -Recurse -Force $stage
  Get-Item $zip | Select-Object FullName, Length
} finally {
  Pop-Location
}
