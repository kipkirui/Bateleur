# Prebuilt Windows drops

Unsigned Windows builds so you can open Bateleur without Node or Rust.
On GitHub, use the raw download links in [`README.md`](../README.md#try-it-windows).
These are **not** Authenticode-signed. Windows SmartScreen and Defender may
warn; that is expected until a code-signing certificate is in place.

| File | Use |
| --- | --- |
| [`windows/Bateleur_0.27.4_x64_en-US.msi`](./windows/Bateleur_0.27.4_x64_en-US.msi) | Installer. Prefer this. |
| [`windows/Bateleur_0.27.4_x64-setup.exe`](./windows/Bateleur_0.27.4_x64-setup.exe) | NSIS setup. Defender often quarantines this one. |
| [`windows/Bateleur.exe`](./windows/Bateleur.exe) | Portable. Needs [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows 11 usually has it). |

SHA-256 checksums: [`windows/SHA256SUMS`](./windows/SHA256SUMS).

macOS `.dmg` and Linux AppImage/`.deb` are not in this folder. Those come
from tagging `vX.Y.Z` (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)) or from
building on that OS.

Refresh these files when you want testers on a new Windows drop:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$PWD\.tauri\bateleur.key"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$PWD\.tauri\bateleur.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run bundle
```

Copy the `.msi` and `-setup.exe` from `src-tauri/target/release/bundle/` and
`bateleur.exe` from `src-tauri/target/release/` into `prebuilt/windows/`.
Do not commit `src-tauri/target`.
