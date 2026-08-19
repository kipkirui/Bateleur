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

This is a universal IMAP/POP client, not a Gmail wrapper. Add any mailbox. Mail stays on your machine.

## Status

Early (0.26.8). You can add an IMAP or POP mailbox (app password or Sign in with Google / Microsoft), sync INBOX / Sent / Drafts / Junk (IMAP), read HTML mail as designed, send through SMTP after a second confirm (IMAP APPENDs a copy to Sent), archive / unread / flag, reply-all, forward, and open or attach files. Remote images stay off until you load them. IMAP inboxes are watched with IDLE; POP is polled. New unread mail can raise an OS toast. Magazine view uses a cover, briefing, and article teasers, and stacks same-subject threads. With staff hired you can pin, rename, merge, or mark a stack not a story; the rail lists those stories. Raw is the dense table. **Back issues** is archived mail by month. Paper is cream, newsprint, sepia, or night. Compose can go full-page (Focus); reply quotes sit collapsed under the letter; `::` / `/` snippets are local. Archive, flag, and send undo with `z`. `x` multi-selects. Ctrl+K searches indexed mail and runs commands. Clearing Action shows what you did today. An **Awaiting reply** badge lists open loops (flagged, or sent with no answer after four days). **Uncertain** holds weak classifier matches until you put them on Action or Reading. **Radar** lists meeting invites already in mail (ICS) — Open in calendar hands the file to the OS; there is no CalDAV. Select text in a letter and **Keep** it; **Clippings** is a local list (rail, Ctrl+K), not a notes app. The Co-Pilot tab is **Next** when unread Action (or an awaiting loop) is waiting — Open, Reply, Draft a reply; it never auto-opens and never sends. Hire staff stores a BYOK key in the OS keychain; summarize-this, draft-this, triage, and **Draft an RSVP** run from the reader when those switches are on. Triage can move a letter between Action and Reading; **Triage new mail** can do that after sync, off until you turn it on. **Summarize this account** writes a Morning Brief from unread Action (up to eight letters; a line leaves once you read it). **Summarize all new mail** can blurbs new inbox letters after sync, off until you turn it on. Drafts open in Compose and never send on their own.

Living checklist: [`STATUS.md`](./STATUS.md).  
Product thesis: [`Make Email Great Again.md`](./Make%20Email%20Great%20Again.md).
Released versions: [`CHANGELOG.md`](./CHANGELOG.md).

## Stack

- **UI:** React + TypeScript (Vite)
- **Shell:** Tauri 2 (native webview, not Electron)
- **Core:** Rust crate `bateleur-core` (shared with a future mobile app)
- **Mail:** IMAP and POP over rustls, SMTP via lettre, SQLite cache, OS keychain for passwords and the staff key
- **Design:** CSS tokens in `src/styles.css` — cream, newsprint, sepia, and night paper

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

Add a mailbox from **Settings**. IMAP or POP login is tested immediately; the password goes in Windows Credential Manager / the OS keychain; recent mail is cached in SQLite. Compose / Reply send through that account’s SMTP after a second **Confirm send**. IMAP then APPENDs a copy to Sent; POP keeps a local Sent copy.

If Sync says there is no password in the OS keychain, add the mailbox again from Settings with the same address — that writes the secret into Credential Manager. Re-adding updates the existing mailbox; it does not duplicate it.

Gmail and Outlook can **Sign in with Google / Microsoft** (still IMAP/SMTP, not a vendor mail API). That needs a one-time Desktop / public OAuth client ID in Settings, or `BATELEUR_GOOGLE_OAUTH_CLIENT_ID` / `BATELEUR_MICROSOFT_OAUTH_CLIENT_ID`. Google also needs the Desktop client secret (`BATELEUR_GOOGLE_OAUTH_CLIENT_SECRET`). For Microsoft, Azure must list redirect `http://localhost` on the **Mobile and desktop applications** platform (not Web or SPA). App passwords still work: Gmail’s 16-letter [App password](https://myaccount.google.com/apppasswords) (not the Google account password). Enable IMAP or POP in the provider’s settings first.

If the server certificate is untrusted, tick **Trust this server's certificate** and connect again.

## Reading mail

Open a message with Enter or double-click. HTML mail (newsletters, receipts) should look like the sender designed them. Links open in your browser; `mailto:` opens Compose. Use **Show plain text** in the reader if you want the text part.

Keyboard: `j` / `k` move, `Enter` open, `r` reply, `a` reply all, `f` forward, `c` or `n` compose, `Ctrl+S` save draft, `Ctrl+K` search, `Esc` close. In Compose, **Focus** fills the window; type `::thanks` or `/followup` for a snippet. **Cc** and **Bcc** sit behind those labels until you need them; Reply all puts extra people on Cc. **Save draft** writes to Drafts (IMAP) or a local copy (POP).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Please read the [code of conduct](./CODE_OF_CONDUCT.md) and the [security policy](./SECURITY.md) before filing issues about credentials or the reader.

## License

[MIT](./LICENSE) © 2026 [Kipkirui](https://x.com/twkip).

## Attribution

Created and maintained by **Kipkirui** — [@twkip](https://x.com/twkip) on X.

Wordmark set in [Barlow](https://fonts.google.com/specimen/Barlow) by Jeremy Tribby (OFL).
