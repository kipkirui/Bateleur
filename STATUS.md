# Status

Living checklist against the product in [`Make Email Great Again.md`](./Make%20Email%20Great%20Again.md). Update this when a surface ships or is cut.

## Shipped

**Shell.** Staff-off homepage: left rail (~220px), center feed, Co-Pilot drawer collapsed. Magazine | Raw. Day / night paper. Compose overlay (Cmd+N). Settings overlay is mailboxes only — no separate Add Account window. Hire staff opens the BYOK modal. Keyboard: j/k, Enter, r, c, e (archive), u (unread), s (flag), Ctrl+K, Esc. Overlay hover scrollbars on rail and feed. Desk waiting-on is empty until the user flags something — no fake “Acme quote” copy. Fixture / demo mailboxes are gone; the UI never seeds sample accounts or messages.

**Accounts.** Any IMAP or POP mailbox via Settings → Mail. Autoconfig guesses hosts for Gmail, Outlook, Fastmail, Yahoo, iCloud. Manual host / port / username. TLS via rustls (Mozilla roots + OS store), with an explicit “trust this certificate” override. Password or OAuth refresh token lives in the OS keychain (`bateleur.imap` / sanitized address), never SQLite. Gmail and Outlook can **Sign in with Google / Microsoft** (OAuth 2.0 + PKCE, then IMAP/POP/SMTP XOAUTH2 — not the Gmail API or Microsoft Graph). That needs a Desktop / public-client ID once (Settings, or `BATELEUR_GOOGLE_OAUTH_CLIENT_ID` / `BATELEUR_MICROSOFT_OAUTH_CLIENT_ID`). App passwords still work. Save requires a persistent platform store (Windows Credential Manager / macOS Keychain / Secret Service) and round-trips through a *new* keyring entry so an in-memory mock cannot look like success. Re-adding the same address updates that mailbox instead of duplicating it. If Sync reports no password, add the mailbox again from Settings so the secret is written to the real store.

**Sync.** IMAP LIST of folders, then fetch: last 40 INBOX, 30 each of Sent / Drafts / Junk, and up to eight custom folders (15 each). POP fetches the last 40 INBOX messages by UIDL and leaves them on the server; there are no POP folders. MIME parse (`mail-parser`), Action vs Reading classify (local heuristics: 2FA, invoices, “please reply”, etc.), SQLite cache (`bateleur.db` in app data). Unified inbox or per-account. Sync reuses the keychain password. After connect, IMAP IDLEs INBOX (RFC 2177) and refetches on change or every 8 minutes; if the server refuses IDLE, it polls every 3 minutes. POP polls every 3 minutes. The rail shows Syncing / Synced / Watching / Sync failed. Settings → Sync still forces a fetch.

**Send.** Confirm-gated SMTP via `lettre` (STARTTLS on 587, implicit TLS on 465). Compose / Reply / mailto: pick a From mailbox, then **Send** then **Confirm send**. The same OS-keychain password or OAuth token is used. After SMTP succeeds, IMAP accounts APPEND the RFC822 to Sent (`\Seen`). POP accounts keep a local Sent copy. Empty body or a missing To address is refused.

**Reader.** The HTML MIME part is what we open, not the text conversion. Newsletters (Facebook, Gmail, etc.) keep `<style>` as CSS — including `:root` color-scheme, `@font-face`, and Gmail’s `u + .body` hacks — instead of dumping those rules as the letter. Scripts, forms, and `javascript:` URLs are stripped; tables, images, and author CSS stay. The iframe does not force Bateleur serif/charcoal onto the letter. Remote http(s) images are blocked until you load them (this letter, or always in Settings). `cid:` inline images rewrite from cached MIME parts. http(s) links open in the system browser. `mailto:` opens Compose in Bateleur. Plain text autolinks URLs and addresses. Toggle to plain text when HTML is present. Gmail App-password hint in Settings. Opening a letter STOREs `\Seen`. Reader footer: Unread, Flag, Archive, Reply. Files list with Save to Downloads.

**Flags.** Unread (`\Seen`), flag (`\Flagged`), and archive. Archive uses IMAP MOVE when the server allows it, otherwise COPY + `\Deleted` + EXPUNGE. Destination is `\Archive`, a folder named Archive, or Gmail `[Gmail]/All Mail` (`\All`). That folder is listed and stored so archive has somewhere to go; it is not fetched into the feed. Local-only Sent copies (`sent:…`) cannot STORE — sync first. IMAP succeeds, then SQLite. POP flags and archive are local only; archived POP mail stays on the server so other clients still see it, and Bateleur will not re-download it.

**Attachments.** MIME parts are cached in SQLite (up to 12 MB each). The reader lists non-inline files; Save writes to Downloads. Compose Attach adds up to eight files (8 MB each) as a mixed MIME payload. Inline `cid:` images are not listed as files; they render in the letter.

**Plain text and summaries.** Subjects, from-names, feed previews, and the plain-text body decode HTML entities (`&nbsp;`, `&#160;`, `&amp;`, …) and strip leftover tags (`<strong>`, `<b>`, `<bold>`, `<em>`, …). Full HTML still renders those tags (nonstandard `<bold>` is treated as `<strong>`). Cleanup runs on display for already-cached mail; **Sync** writes the cleaned preview/body into SQLite.

**Not staff.** Hire staff opens a modal (provider list, key field, capability switches) and does nothing yet. Settings is mailboxes only.

## Pending — mail client

These are required before Bateleur is an Outlook-shaped client, not a reader.

- Second-account proof is already possible; keep unified vs per-account as the user’s choice

## Pending — staff (only after mail works)

- Persist BYOK: provider + model + key in the OS keychain
- Capability switches that actually run: summarize this message, then this account / all new mail
- Drafts that never send: open the full letter, Send is a second step
- Stories: pin / rename / merge / “not a story”
- Morning Brief (summarize-on)
- Co-Pilot drawer only when there is a next action
- Triage and scheduling later; no auto-send; waiting-on stays a manual flag until then
- No our-cloud proxy, no bundled inference, no Gmail API, no Microsoft Graph

## Pending — platform

- Signed installers (`.dmg`, `.msi`, AppImage/`.deb`) and auto-updater
- Mobile shell (`tauri android/ios init`); hard parts are background IMAP and push
- Calendar protocol (CalDAV / Google) — do not fake Radar from nothing

## Deliberately out of scope

Hosts that only speak a proprietary mail API and not IMAP/POP. Fake Balance %. Auto-send. Selling tokens or proxying inference.
