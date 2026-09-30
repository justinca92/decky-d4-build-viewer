# D4 Build Viewer (Decky Loader plugin)

Browse Diablo IV builds in the Steam Deck Quick Access Menu.

> **One supported build site for now.** Links from other build sites aren't supported yet.
>
> Unofficial fan tool, not affiliated with Blizzard Entertainment or any build site. Builds and notes belong to their authors; every build page has a button to open the original.

## Status

- **Version 0.2.1**, tested on a Steam Deck with Decky Loader.
- **No release download yet.** The plugin is waiting on permission from the build sites before it is published. Until then you can build the zip yourself (see [Build from source](#build-from-source-windows)).
- **Try it in the browser:** an [interactive demo](https://claude.ai/artifact/3fnmkKJ5b8meN432vpqVde) of the Quick Access Menu panel, with example builds.
- **Other build sites** will only be added with each site's permission.

## Features

- **Get a link from your phone**: the QR screen opens a small receiver on the Deck (port 8765) with a one-time token in the QR. Scan it with a phone on the **same Wi-Fi**, paste the build link, send. The receiver only runs while that screen is open, and only accepts the phone that scanned the current QR.
- **Or type/paste a link** under the QR (Steam keyboard, Ctrl+V).
- Every variant of a build: skill bar, gear with affixes/tempering/masterwork, skill point order, paragon boards and glyphs, talismans, mercenaries, author notes. Switch variants with **LB/RB**, or A/X on the variant row.
- `/ko/` links show the build in Korean, other links in English, including item and skill names inside the author's notes. Everything else follows the Steam language.
- The installed version is shown under **About** on the home screen.

## Privacy

- Outbound requests are plain HTTPS GETs to a fixed allowlist of the supported build site's hosts (page, data and icon hosts), made only when you load a build. Any other host, including redirects to one, is refused.
- No cookies, referer, analytics, ads or accounts. The user agent is a generic `Mozilla/5.0 (X11; Linux x86_64)` with no device, account or plugin details.
- The frontend makes no network requests of its own; icons are stored inside each build file and shown from there.
- The phone page is served by the Deck itself and loads nothing from the internet.

## Install

1. Decky Loader → Settings → General → turn on **Developer mode**.
2. Build `DeckyD4Builds-v<version>.zip` (see below) and copy it to the Deck (e.g. `~/Downloads`). Newer zips install over older ones.
3. Decky Loader → Settings → Developer → **Install Plugin from ZIP File** → pick the zip.

## What it stores, and uninstalling

| Path | Contents |
| --- | --- |
| `~/homebrew/data/D4 Build Viewer/builds/<build>.json` | one file per saved build, icons embedded |
| `~/homebrew/data/D4 Build Viewer/datasets/` | name dataset cache (~1 MB per language, plus small name tables when a guide mentions items in another language) |
| `~/homebrew/settings/D4 Build Viewer/` | settings |
| `~/homebrew/logs/D4 Build Viewer/` | plugin log (errors only include the build link) |

- Deleting a build removes its file.
- **Reset everything** (home → Settings) deletes all of the above and empties the log, leaving the plugin installed.
- **Uninstalling the plugin in Decky deletes all of the folders above** (`_uninstall` in `main.py`); Decky removes the plugin folder itself. Decky Loader's own log may still note that the plugin was loaded; that file belongs to Decky.
- Pages and icon sources are only held in memory while a build downloads.

## Build from source (Windows)

```powershell
.\package.ps1
```

Uses the portable Node in `.tools/node`, runs `npm run build`, and writes `out/DeckyD4Builds-v<version>.zip` (version from `package.json`; bump it for every release). Zips of earlier versions stay in `out/`.

## License

BSD 3-Clause. See [LICENSE](LICENSE).
