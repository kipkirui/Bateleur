# Changelog

All notable changes to Bateleur are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Before 1.0, **minor** versions are user-visible mail surfaces. **Patch** versions
are fixes. Keep `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml`, and `crates/bateleur-core/Cargo.toml` on the same number.

## [0.27.5] - 2026-08-19

### Changed

- After SMTP, the toast says the letter cannot be recalled (and names attached files). Confirm lists those files. Compose accepts drag-and-drop attachments and reports empty, oversized, or extra files instead of dropping them silently

## [0.27.4] - 2026-08-19

### Added

- Unsigned Windows `.msi`, NSIS setup, and a portable `Bateleur.exe` in [`prebuilt/windows`](./prebuilt/windows) so testers can open the app without compiling. Not Authenticode-signed; prefer the `.msi`. README **Try Windows** links straight to the downloads

### Fixed

- Wheel over an HTML letter no longer dies after the mailbox refreshes in the background. The overlay keeps scrolling; newsletter CSS cannot trap the wheel inside the iframe, and iframe height stays put while you are scrolling

## [0.27.3] - 2026-08-19

### Changed

- Settings is a vertical tab at the bottom of the right rail, under Hire staff / Next / Staff, pinned inside the window so the default size does not clip it. Magazine / Raw and paper stay on the left

## [0.27.2] - 2026-08-19

### Fixed

- Magazine / Raw, paper stocks, and Settings stay pinned at the bottom of the left rail. Accounts and folders scroll above them, so you do not need a maximized window to reach Settings

## [0.27.1] - 2026-08-19

### Changed

- App and installer icons are the logo mark on cream paper, not a black or transparent tile (Windows paints transparency as a hole). The NSIS installer uses that icon. WebView2 is embedded in the installer instead of downloaded at setup

### Fixed

- Unsigned Windows builds are still going to trip Defender. Prefer the `.msi` for testers; Authenticode is what actually clears SmartScreen

## [0.27.0] - 2026-08-19

### Added

- GitHub Releases build Windows NSIS/MSI, macOS `.dmg`, and Linux AppImage/`.deb`. Updater artifacts are minisign-signed. Settings **Check GitHub for Bateleur updates** (on by default) offers Install; it does not apply an update until you say so

## [0.26.11] - 2026-08-19

### Fixed

- Wheel and arrow keys over an HTML letter scroll the reader again. The letter iframe stays sandboxed without `allow-scripts`; that console line is the browser refusing newsletter JavaScript, not a broken scroller

## [0.26.10] - 2026-08-19

### Fixed

- Click-drag in the letter no longer rubber-bands the HTML body on every axis. The reader only scrolls vertically, and iframe height stays put while the pointer is down

## [0.26.9] - 2026-08-19

### Fixed

- **All mailboxes** is the combined view again: Action / Reading / Sent mix every account, letters show which mailbox they belong to, and connecting a second mailbox no longer jumps you into that account alone

## [0.26.8] - 2026-08-19

### Fixed

- Newsletters no longer pick up OS dark mode (forced light color-scheme in the letter iframe). Opening a letter no longer stretch-resizes as the iframe guesses its height

## [0.26.7] - 2026-08-19

### Fixed

- Sign in with Google sends the Desktop client secret on the token request. Google still issues one for Desktop apps; paste it next to the client ID in Settings

## [0.26.6] - 2026-08-19

### Fixed

- Feeds, stories, Back issues, Radar, and sender pages list newest received first. A thread in the reader still reads oldest to newest

## [0.26.5] - 2026-08-18

### Fixed

- Sign in no longer stays on Waiting for browser after the localhost page says you are signed in. The loopback listener starts before the browser opens, ignores favicon hits, and the mailbox is saved as soon as tokens land — first fetch runs in the background like Sync

## [0.26.4] - 2026-08-18

### Fixed

- Microsoft Sign in no longer dies on Windows Credential Manager’s 2560-character limit. The refresh token stays in the OS keychain (split across entries if needed); the short-lived access token is not stored

## [0.26.3] - 2026-08-18

### Fixed

- Sign in with Microsoft (and Google) exchanges the auth code using the same TLS roots as mail — OS store plus Mozilla — so Windows / corporate CAs are trusted. The browser step already worked; the token host was the one that failed with UnknownIssuer

## [0.26.2] - 2026-08-18

### Fixed

- Sign in with Google / Microsoft are amber buttons, not text links. Tapping them with an empty address now explains that you need the mailbox first. An unsaved client ID is written before the browser opens, and Microsoft shows Waiting for browser while it does

## [0.26.1] - 2026-08-18

### Fixed

- Sign in with Microsoft sends `http://localhost:{port}` (no trailing slash) so it matches an Azure **Mobile and desktop** redirect of `http://localhost`. Settings copy names that platform, URI, and public-client switch

## [0.26.0] - 2026-08-18

### Added

- **Clippings:** select text in a letter and Keep it. Quotes live in a local list (rail badge, Ctrl+K, or under the letter). Not a notes app — 200 clips max, 400 characters each. The letter iframe still has no scripts

## [0.25.0] - 2026-08-18

### Added

- **Back issues** is archived mail as a monthly shelf (serif headlines, by month), not a folder tree. Archive keeps a local copy. IMAP also fetches the Archive folder when it is not Gmail All Mail. `e` on a back-issue letter does nothing

## [0.24.0] - 2026-08-18

### Added

- Paper stocks beyond day/night: **Cream**, **Newsprint**, **Sepia**, and **Night**. Pick one in the rail or Ctrl+K; it persists. Cream and night are the same papers as before

## [0.23.0] - 2026-08-18

### Added

- **Uncertain** is a quiet rail tray for weak classifier matches (bare “invoice”, marketing invites, password newsletters). 2FA, payment-due invoices, please-reply, and calendar parts stay Action. Put a letter on Action or Reading; that placement survives the next sync

## [0.22.0] - 2026-08-18

### Added

- **Save draft** from Compose (or Ctrl+S). IMAP APPENDs to Drafts with `\Draft`; POP keeps a local copy. Opening a draft resumes Compose, not the reader. Saving again replaces that draft. Sending a resumed draft removes it from Drafts. Close still discards unless you save

## [0.21.0] - 2026-08-18

### Added

- Compose has **Cc** and **Bcc** (hidden until you open them, or until Reply all / a mailto fills them). Reply all puts the correspondent on To and everyone else on Cc. A reply sets `In-Reply-To` and `References` from the original Message-ID so threads stay threaded. Bcc is envelope-only and is not written into Sent

## [0.20.1] - 2026-08-18

### Fixed

- Morning Brief lists at most eight unread Action letters. A line leaves the list once that letter is read, archived, or no longer Action. Refresh brief still rewrites the deck

## [0.20.0] - 2026-08-18

### Added

- **Reply all** and **Forward** from the reader, `a` / `f`, or Ctrl+K. Reply all fills To with From, To, and Cc except your addresses and no-reply. Forward uses `Fwd:`, an empty To, the original as a quote, and attaches original files that fit Compose (eight files, 8 MB). Reply stays the primary action. Sent-folder Reply goes to the original recipients, not yourself. Sync again to store Cc on mail that was already cached

## [0.19.0] - 2026-08-18

### Added

- **Radar** lists meeting invites that already arrived as mail (`text/calendar` / `.ics`). The reader shows when, where, and who; Open in calendar hands the file to the OS. There is no CalDAV and no empty fake calendar
- Invites classify as Action. **Draft an RSVP** is an opt-in staff switch — it opens Compose and never sends

## [0.18.0] - 2026-08-18

### Added

- **Triage this letter** is an opt-in staff switch: the model can move a letter between Action (front page) and Reading (back page). Why here? shows the staff reason. Local 2FA / password / KYC stays Action on batch. A sender you moved to Reading twice still wins. Mail still works if a call fails
- **Triage new mail (on sync)** is a second, off-by-default switch: after IDLE or Sync, up to eight new unread inbox letters can be triaged. Decisions persist across fetch so the next sync does not undo them

## [0.17.0] - 2026-08-18

### Added

- Stories can be pinned, renamed, merged, or marked not a story. The rail lists pinned or long threads only after staff is hired; magazine still stacks same-subject letters without a key
- The Co-Pilot tab reads **Next** when there is unread Action (or an awaiting loop). Open, Reply, and Draft a reply sit on that letter. The desk stays collapsed until you open it, and it never sends

## [0.16.0] - 2026-08-18

### Added

- **Summarize this account** writes a Morning Brief from unread Action (on demand from the feed, desk, or Ctrl+K)
- **Summarize all new mail** is opt-in: after IDLE or Sync, up to eight new unread inbox letters get a per-letter blurb. Mail still works if a call fails. Batch-on-sync stays off until that switch is on



### Fixed

- Gemini defaults to `gemini-flash-latest`. If that id 404s, staff lists models for the key and retries with a Flash model this key can actually call



### Fixed

- Gemini staff calls use the OS certificate store (same as mail) and send the key in `x-goog-api-key` instead of the URL. A TLS or model error now shows the real reason instead of “Could not reach the provider”



### Added

- Hire staff stores the API key in the OS keychain (`bateleur.staff`) and provider / model / capability switches in SQLite. Mail bodies go only to the provider you pick — no Bateleur proxy
- **Summarize this message** in the reader when that switch is on. The blurb is kept with the letter
- **Draft a reply** opens Compose with generated text. Send is still a second step; the desk never sends. Mail still works if a call fails

## [0.14.3] - 2026-08-18

### Fixed

- Hire staff provider list is selectable. Compatible endpoint shows a URL field. Summarize / drafts switches stay off until staff actually runs

## [0.14.2] - 2026-08-18

### Changed

- Rail status is **N need you** (unread Action) and **Awaiting a reply** (their turn). Syncing / Sync failed still interrupt that stack; Watching and Synced stay off it so the counts stay the only standing lines

## [0.14.1] - 2026-08-18

### Changed

- **Awaiting reply** is a badge on the left rail, not the staff drawer. Those letters are open loops — you flagged them to chase, or you sent them and heard nothing for four days. **N waiting** under the mark is still Action mail that needs you. The right rail is Hire staff again

## [0.14.0] - 2026-08-18

### Added

- Compose **Focus** fills the window (no card chrome). Reply keeps the original letter in a collapsed magazine quote instead of dumping `>` walls into the editor; it is appended on send
- Local snippets: type `::thanks` or `/followup` in the letter. Manage them under Snippets in Compose. They stay on this machine

## [0.13.0] - 2026-08-18

### Added

- Session receipts: archive, flag, unread, send, and Reading moves count for the local day. Empty Action and the desk show an honest “You archived 9 today” line; after two minutes idle the same sentence can toast once
- Waiting-on on the desk: flagged letters, plus sent letters with no matching reply after four days. Dismiss hides a stale nudge. The collapsed desk tab reads “N waiting-on” when there is a loop. The desk still does not send
- Magazine groups same-subject threads as a developing story (cover kicker, briefing stacks). The reader lists a numbered thread when there are three or more letters. Pin / rename / merge stay staff-pending. Raw stays a flat list

## [0.12.1] - 2026-08-18

### Fixed

- Opening a letter covers the window again instead of squeezing into a fourth sidebar column. The iframe still refuses scripts; leftover `<script>` tags in HTML mail are stripped harder so Chromium stops warning about `about:srcdoc`

## [0.12.0] - 2026-08-18

### Added

- SQLite FTS5 index over cached mail (from, subject, preview, body). Prefix search, current mailbox or all
- Ctrl+K / `/` command palette: jump to feeds and accounts, magazine/raw, paper, compose, settings, archive this feed or all Reading, plus letter hits. `>` filters to commands only. Signed installers stay pending

## [0.11.0] - 2026-08-18

### Added

- Undo (`z` or the toast) for archive, flag, unread, and send. Archive and send wait eight seconds so undo never has to recall a letter that already left
- Multi-select: `x` or the checkbox, then bulk Archive / Flag / unread. Escape clears the selection

### Fixed

- The feed list scrolls again. Magazine is a cover story, a briefing strip, and article teasers; Raw stays the dense table

## [0.10.0] - 2026-08-18

### Added

- Magazine Action feed: lead card plus a briefing strip, category badges, lede lines, inline Archive / Reply / Reading, and **Why here?**
- Reading stays a compact row. Empty Action says “Nothing needs you right now.”
- Classification stores the matched signal. Move a sender to Reading twice and they stay there
- Sender page (click the name): frequency, letters from that address, Keep in Reading / Guess again
- Reader article treatment: send frequency, reading time, pull-quote lede, more from this sender. Raw view is unchanged

## [0.9.0] - 2026-08-18

### Added

- OS alerts when new unread inbox mail arrives (Windows toast, macOS Notification Center, Linux notify). One toast per fetch, not one per letter
- Settings checkbox **Notify when new mail arrives** (on by default). Boot and Settings → Sync do not toast the existing mailbox

## [0.8.0] - 2026-08-18

### Added

- Sign in with Google or Microsoft (OAuth 2.0 PKCE). IMAP, POP, and SMTP use XOAUTH2 — not the Gmail API or Microsoft Graph
- Refresh tokens live in the OS keychain; access tokens refresh before fetch and send
- Optional Desktop / public-client IDs in Settings, or `BATELEUR_GOOGLE_OAUTH_CLIENT_ID` / `BATELEUR_MICROSOFT_OAUTH_CLIENT_ID`

## [0.7.0] - 2026-08-17

### Added

- POP ingest: last 40 messages into the local inbox (UIDL, leave mail on the server)
- Unread / flag / archive for POP are local; SMTP send still works (no IMAP APPEND)
- Background poll every 3 minutes for POP mailboxes

## [0.6.0] - 2026-08-17

### Added

- IMAP IDLE on INBOX (8-minute keepalive) with a 3-minute poll fallback if IDLE is refused
- Background fetch on launch; rail shows Syncing / Synced / Watching / Sync failed

## [0.5.0] - 2026-08-17

### Added

- Remote images are blocked by default. Load for this letter, or always load from Settings

## [0.4.0] - 2026-08-17

### Added

- Attachments: listed in the reader, saved to Downloads, attached on compose (up to eight files, 8 MB each)
- Inline `cid:` images rewrite from cached MIME parts when you open a letter

## [0.3.0] - 2026-08-17

### Added

- IMAP flags: unread (`\Seen`), flag (`\Flagged`), and archive (MOVE, or COPY + `\Deleted` + EXPUNGE)
- Opening a letter marks it `\Seen`; `e` archives, `u` marks unread, `s` toggles flag
- Archive destination is `\Archive`, a folder named Archive, or Gmail All Mail (`\All`) — stored, not fetched

## [0.2.0] - 2026-08-17

### Added

- IMAP folder list (Sent, Drafts, Junk, and a capped set of custom folders)
- Sync fetches those folders, not only INBOX
- Confirm-send APPENDs a copy to the server Sent mailbox (`\Seen`)
- Changelog and a shared 0.2.0 version across npm, Tauri, and Cargo

## [0.1.0] - 2026-08-17

### Added

- Public MIT release: staff-off shell, IMAP INBOX sync, confirm-gated SMTP,
  HTML reader, local SQLite cache, OS keychain passwords
