# Contributing

Thanks for considering a patch. Bateleur is an open-source, local-first desktop
mail client. The product thesis is [`Make Email Great Again.md`](./Make%20Email%20Great%20Again.md).
What is shipped vs still open lives in [`STATUS.md`](./STATUS.md) — start there
before proposing a large feature.

## Ground rules

- Mail works with zero AI. Do not make a model required to read or send.
- No Gmail API. No Microsoft Graph. Speak IMAP / POP / SMTP.
- Passwords, OAuth refresh tokens, and API keys stay in the OS keychain, never in SQLite or logs.
- Send stays confirm-gated. Drafts never send themselves.
- Do not add a cloud proxy for inference or mail.
- Match the paper UI: cream / charcoal / amber, no emoji in chrome.

By contributing you agree that your work is licensed under the MIT License
(see [`LICENSE`](./LICENSE)).

## Setup

Windows testers who only want to open the app can skip this section and use
[`prebuilt/windows`](./prebuilt/windows) — see [`README.md`](./README.md#try-it-windows).

To work on the code you need Node.js 22+, Rust (stable), and the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev
```

`npm run dev` is the Vite UI only — no IMAP, empty mailbox.

## Project map

| Path | Role |
| --- | --- |
| `src/` | React UI |
| `src-tauri/` | Tauri shell, IMAP, POP, SMTP, SQLite, keychain |
| `crates/bateleur-core/` | Shared types and text helpers (desktop + future mobile) |
| `src/styles.css` | Design tokens |
| `prebuilt/windows/` | Unsigned Windows MSI, NSIS setup, and portable exe for testers |

## Pull requests

1. Open an issue first if the change is more than a small fix.
2. Keep the diff focused. Do not mix refactors with features.
3. Update `STATUS.md` when you ship or cut a surface.
4. Bump the version and add a `CHANGELOG.md` entry (see Versioning below).
5. Do not commit `node_modules`, `src-tauri/target`, `.env`, or mail databases.
6. Unsigned Windows test drops belong in `prebuilt/windows/` (see [`prebuilt/README.md`](./prebuilt/README.md)). Refresh those files when testers should try a new drop without compiling.
7. Do not add sample / fixture mailboxes or fake “waiting-on” copy.

## Versioning

Bateleur is pre-1.0. Use SemVer:

- **MINOR** — a user-visible mail surface (folders, flags, attachments, …)
- **PATCH** — a fix that does not change the surface

When you cut a version, update all four together:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `crates/bateleur-core/Cargo.toml`

Then add a section to [`CHANGELOG.md`](./CHANGELOG.md) and tag `vX.Y.Z` on `main`.

## Releases

Tag `vX.Y.Z` on `main` to build Windows NSIS/MSI, macOS `.dmg`, and Linux AppImage/`.deb` as a **draft** GitHub Release. The workflow signs updater artifacts with minisign. Apple notarization and Windows Authenticode only run if those secrets exist; without them the installers still build, unsigned at the OS level.

Required GitHub Actions secret:

- `TAURI_SIGNING_PRIVATE_KEY` — contents of the private key at `.tauri/bateleur.key` (never commit this file)

Optional:

- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — only if the key has a password
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` — Developer ID + notarization
- A Windows Authenticode / Azure Trusted Signing cert when you have one

Local installer (needs the updater private key in the environment):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$PWD\.tauri\bateleur.key"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$PWD\.tauri\bateleur.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run bundle
```

On Windows, hand testers the `.msi` first (also in `prebuilt/windows`). Unsigned NSIS setup `.exe` files are the ones Defender quarantines. Authenticode (a code-signing certificate) is what actually clears SmartScreen.

Local `npm run bundle` also needs `TAURI_SIGNING_PRIVATE_KEY` set to the key file contents if updater artifacts are on. The OS installers still build unsigned without Authenticode.

If you lose the updater private key, already-installed apps cannot verify new updates. Generate a new pair with `npx tauri signer generate --ci -w .tauri/bateleur.key` and put the new public key in `src-tauri/tauri.conf.json`.

## Code of conduct

See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Maintainer

[Kipkirui](https://x.com/twkip) — [@twkip](https://x.com/twkip) on X.
