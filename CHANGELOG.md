# Changelog

All notable changes to Bateleur are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Before 1.0, **minor** versions are user-visible mail surfaces. **Patch** versions
are fixes. Keep `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml`, and `crates/bateleur-core/Cargo.toml` on the same number.

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
