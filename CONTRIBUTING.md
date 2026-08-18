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

You need Node.js 22+, Rust (stable), and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
for your OS.

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

## Pull requests

1. Open an issue first if the change is more than a small fix.
2. Keep the diff focused. Do not mix refactors with features.
3. Update `STATUS.md` when you ship or cut a surface.
4. Bump the version and add a `CHANGELOG.md` entry (see Versioning below).
5. Do not commit `node_modules`, `src-tauri/target`, `.env`, or mail databases.
6. Do not add sample / fixture mailboxes or fake “waiting-on” copy.

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

## Code of conduct

See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Maintainer

[Kipkirui](https://x.com/twkip) — [@twkip](https://x.com/twkip) on X.
