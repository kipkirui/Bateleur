<p align="center">
  <img src="src/assets/logo/app_icon.png" width="96" height="96" alt="Bateleur">
</p>

<h1 align="center">Bateleur</h1>

<p align="center">
  Make Email Great Again. A local-first desktop mail client that reads like a magazine.
</p>

<p align="center">
  <a href="https://x.com/twkip">Kipkirui on X</a>
  ·
  <a href="./LICENSE">MIT License</a>
  ·
  <a href="./STATUS.md">Status</a>
  ·
  <a href="./CHANGELOG.md">Changelog</a>
</p>

You are the editor, not the intern who has to read every raw wire. Invoices and “please reply” land in **Action**. Newsletters and long FYI land in **Reading**. Staff (summaries, drafts) is optional, off until you turn it on, and bring-your-own-key — we do not sell tokens and we do not proxy inference.

This is a universal IMAP client, not a Gmail wrapper. Add any mailbox. Mail stays on your machine.

## Status

Early (0.2.0). You can add an IMAP mailbox, sync INBOX / Sent / Drafts / Junk, read HTML mail as designed, and send through SMTP after a second confirm (a copy is APPENDed to Sent). Flags, attachments, POP, OAuth, and staff are still open.

Living checklist: [`STATUS.md`](./STATUS.md).  
Product thesis: [`Make Email Great Again.md`](./Make%20Email%20Great%20Again.md).
Released versions: [`CHANGELOG.md`](./CHANGELOG.md).

## Stack

- **UI:** React + TypeScript (Vite)
- **Shell:** Tauri 2 (native webview, not Electron)
- **Core:** Rust crate `bateleur-core` (shared with a future mobile app)
- **Mail:** IMAP over rustls, SMTP via lettre, SQLite cache, OS keychain for passwords
- **Design:** CSS tokens in `src/styles.css` — cream paper, charcoal, amber

## Run

You need Node.js 22+, Rust (stable), and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

Desktop app (needed for real mail):

```bash
npm install
npm run tauri dev
```

UI only, in a browser (empty mailbox, no IMAP):

```bash
npm run dev
```

Add a mailbox from **Settings**. IMAP login is tested immediately; the password goes in Windows Credential Manager / the OS keychain; recent INBOX, Sent, Drafts, and Junk mail is cached in SQLite. Compose / Reply send through that account’s SMTP after a second **Confirm send**, then a copy is APPENDed to Sent on the server.

If Sync says there is no password in the OS keychain, add the mailbox again from Settings with the same address — that writes the secret into Credential Manager. Re-adding updates the existing mailbox; it does not duplicate it.

Gmail needs a 16-letter [App password](https://myaccount.google.com/apppasswords) (not the Google account password). Outlook.com usually needs an app password too. Enable IMAP in the provider’s settings first.

If the server certificate is untrusted, tick **Trust this server's certificate** and connect again.

## Reading mail

Open a message with Enter or double-click. HTML mail (newsletters, receipts) should look like the sender designed them. Links open in your browser; `mailto:` opens Compose. Use **Show plain text** in the reader if you want the text part.

Keyboard: `j` / `k` move, `Enter` open, `r` reply, `c` or `n` compose, `Ctrl+K` search, `Esc` close.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Please read the [code of conduct](./CODE_OF_CONDUCT.md) and the [security policy](./SECURITY.md) before filing issues about credentials or the reader.

## License

[MIT](./LICENSE) © 2026 [Kipkirui](https://x.com/twkip).

## Attribution

Created and maintained by **Kipkirui** — [@twkip](https://x.com/twkip) on X.

Wordmark set in [Barlow](https://fonts.google.com/specimen/Barlow) by Jeremy Tribby (OFL).
