# Changelog

All notable changes to Bateleur are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Before 1.0, **minor** versions are user-visible mail surfaces. **Patch** versions
are fixes. Keep `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml`, and `crates/bateleur-core/Cargo.toml` on the same number.

## [0.15.0] - 2026-08-18

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
