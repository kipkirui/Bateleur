use crate::attach::StoredPart;
use bateleur_core::{classify_mail, Account, Attachment, Hero, MailFolder, Mailbox, Message};
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};

pub fn open(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(err)?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            address TEXT NOT NULL,
            label TEXT NOT NULL,
            kind TEXT NOT NULL,
            imap_host TEXT,
            imap_port INTEGER,
            imap_user TEXT,
            smtp_host TEXT,
            smtp_port INTEGER,
            smtp_user TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            feed TEXT NOT NULL,
            from_name TEXT NOT NULL,
            from_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            preview TEXT NOT NULL,
            body TEXT NOT NULL,
            received_at TEXT NOT NULL,
            unread INTEGER NOT NULL,
            waiting_on INTEGER NOT NULL,
            folder TEXT NOT NULL,
            hero_label TEXT,
            hero_tone TEXT
        );
        CREATE TABLE IF NOT EXISTS folders (
            account_id TEXT NOT NULL,
            canonical TEXT NOT NULL,
            imap_name TEXT NOT NULL,
            label TEXT NOT NULL,
            PRIMARY KEY (account_id, imap_name)
        );
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            content_id TEXT,
            inline INTEGER NOT NULL,
            stored INTEGER NOT NULL,
            bytes BLOB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS attachments_message ON attachments(message_id);
        CREATE TABLE IF NOT EXISTS pop_uidl (
            account_id TEXT NOT NULL,
            uidl TEXT NOT NULL,
            message_id TEXT NOT NULL,
            PRIMARY KEY (account_id, uidl)
        );
        CREATE TABLE IF NOT EXISTS prefs (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sender_prefs (
            email TEXT PRIMARY KEY,
            feed TEXT NOT NULL,
            hits INTEGER NOT NULL DEFAULT 0
        );
        ",
    )
    .map_err(err)?;
    let _ = conn.execute(
        "ALTER TABLE accounts ADD COLUMN trust_tls INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN html_body TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE messages ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE accounts ADD COLUMN auth TEXT NOT NULL DEFAULT 'password'",
        [],
    );
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN category TEXT", []);
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN why TEXT", []);
    Ok(conn)
}

pub fn load_mailbox(conn: &Connection) -> Result<Mailbox, String> {
    let mut accounts = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT id, address, label, kind, imap_host, imap_port, imap_user,
                    smtp_host, smtp_port, smtp_user, trust_tls, auth
             FROM accounts ORDER BY kind DESC, label",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| account_from_row(row))
        .map_err(err)?;
    for row in rows {
        accounts.push(row.map_err(err)?);
    }

    let mut messages = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, feed, from_name, from_email, subject, preview, body,
                    received_at, unread, waiting_on, folder, hero_label, hero_tone, html_body,
                    flagged, category, why
             FROM messages ORDER BY received_at DESC",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| message_from_row(row))
        .map_err(err)?;
    for row in rows {
        messages.push(row.map_err(err)?);
    }

    let mut by_message: HashMap<String, Vec<Attachment>> = HashMap::new();
    let mut stmt = conn
        .prepare(
            "SELECT id, message_id, filename, content_type, size, content_id, inline, stored
             FROM attachments ORDER BY filename",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| attachment_meta_from_row(row))
        .map_err(err)?;
    for row in rows {
        let (message_id, meta) = row.map_err(err)?;
        by_message.entry(message_id).or_default().push(meta);
    }
    for message in &mut messages {
        if let Some(list) = by_message.remove(&message.id) {
            message.attachments = list;
        }
    }

    let mut folders = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT account_id, canonical, imap_name, label
             FROM folders ORDER BY canonical, label",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| folder_from_row(row))
        .map_err(err)?;
    for row in rows {
        folders.push(row.map_err(err)?);
    }

    let prefs = sender_overrides(conn)?;
    for message in &mut messages {
        fill_class(message);
        if message.folder == "inbox" {
            if let Some(feed) = prefs.get(&message.from_email.to_lowercase()) {
                if feed == "reading" {
                    message.feed = "reading".into();
                    message.category = None;
                    message.why = Some("You moved this sender to Reading twice.".into());
                }
            }
        }
    }

    Ok(Mailbox {
        accounts,
        messages,
        folders,
    })
}

pub fn upsert_account(conn: &Connection, account: &Account) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO accounts
         (id, address, label, kind, imap_host, imap_port, imap_user, smtp_host, smtp_port, smtp_user, trust_tls, auth)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            account.id,
            account.address,
            account.label,
            account.kind,
            account.imap_host,
            account.imap_port.map(|p| p as i64),
            account.imap_user,
            account.smtp_host,
            account.smtp_port.map(|p| p as i64),
            account.smtp_user,
            account.trust_tls as i64,
            if account.auth.is_empty() {
                "password"
            } else {
                account.auth.as_str()
            },
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn upsert_message(conn: &Connection, message: &Message) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO messages
         (id, account_id, feed, from_name, from_email, subject, preview, body,
          received_at, unread, waiting_on, folder, hero_label, hero_tone, html_body, flagged,
          category, why)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            message.id,
            message.account_id,
            message.feed,
            message.from_name,
            message.from_email,
            message.subject,
            message.preview,
            message.body,
            message.received_at,
            message.unread as i64,
            message.waiting_on as i64,
            message.folder,
            message.hero.as_ref().map(|h| h.label.as_str()),
            message.hero.as_ref().map(|h| h.tone.as_str()),
            message.html_body,
            message.flagged as i64,
            message.category,
            message.why,
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn replace_folders(
    conn: &Connection,
    account_id: &str,
    folders: &[MailFolder],
) -> Result<(), String> {
    conn.execute("DELETE FROM folders WHERE account_id = ?1", [account_id])
        .map_err(err)?;
    for folder in folders {
        conn.execute(
            "INSERT INTO folders (account_id, canonical, imap_name, label)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                folder.account_id,
                folder.canonical,
                folder.imap_name,
                folder.label
            ],
        )
        .map_err(err)?;
    }
    Ok(())
}

pub fn prune_stale_inbox(conn: &Connection, account_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM messages
         WHERE account_id = ?1 AND folder = 'inbox' AND id NOT LIKE ?2",
        params![account_id, format!("{account_id}:inbox:%")],
    )
    .map_err(err)?;
    Ok(())
}

pub fn persist_message(
    conn: &Connection,
    message: &Message,
    parts: &[StoredPart],
) -> Result<(), String> {
    upsert_message(conn, message)?;
    replace_attachments(conn, &message.id, parts)
}

pub fn replace_attachments(
    conn: &Connection,
    message_id: &str,
    parts: &[StoredPart],
) -> Result<(), String> {
    conn.execute("DELETE FROM attachments WHERE message_id = ?1", [message_id])
        .map_err(err)?;
    for part in parts.iter().filter(|p| p.message_id == message_id) {
        conn.execute(
            "INSERT INTO attachments
             (id, message_id, filename, content_type, size, content_id, inline, stored, bytes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                part.meta.id,
                part.message_id,
                part.meta.filename,
                part.meta.content_type,
                part.meta.size as i64,
                part.meta.content_id,
                part.meta.inline as i64,
                part.meta.stored as i64,
                part.bytes,
            ],
        )
        .map_err(err)?;
    }
    Ok(())
}

pub fn prune_orphan_attachments(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM attachments WHERE message_id NOT IN (SELECT id FROM messages)",
        [],
    )
    .map_err(err)?;
    Ok(())
}

pub fn attachment_bytes(conn: &Connection, id: &str) -> Result<(String, String, Vec<u8>, bool), String> {
    conn.query_row(
        "SELECT filename, content_type, bytes, stored FROM attachments WHERE id = ?1",
        [id],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get::<_, i64>(3)? != 0,
            ))
        },
    )
    .map_err(err)
}

pub fn inline_parts(
    conn: &Connection,
    message_id: &str,
) -> Result<Vec<(String, String, Vec<u8>)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT content_id, content_type, bytes FROM attachments
             WHERE message_id = ?1 AND inline = 1 AND stored = 1
               AND content_id IS NOT NULL AND length(bytes) > 0",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([message_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(err)?);
    }
    Ok(out)
}

pub fn prune_local_sent(conn: &Connection, account_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM messages
         WHERE account_id = ?1 AND folder = 'sent' AND id LIKE ?2",
        params![account_id, format!("sent:{account_id}:%")],
    )
    .map_err(err)?;
    Ok(())
}

pub fn remove_account(conn: &Connection, id: &str) -> Result<Account, String> {
    let account = get_account(conn, id)?;
    conn.execute(
        "DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?1)",
        [id],
    )
    .map_err(err)?;
    conn.execute("DELETE FROM messages WHERE account_id = ?1", [id])
        .map_err(err)?;
    conn.execute("DELETE FROM folders WHERE account_id = ?1", [id])
        .map_err(err)?;
    conn.execute("DELETE FROM pop_uidl WHERE account_id = ?1", [id])
        .map_err(err)?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", [id])
        .map_err(err)?;
    Ok(account)
}

pub fn imap_name_for_folder(
    conn: &Connection,
    account_id: &str,
    folder_key: &str,
) -> Result<String, String> {
    if let Some(name) = folder_key.strip_prefix("custom:") {
        if name.is_empty() {
            return Err("Malformed custom folder.".into());
        }
        return Ok(name.to_string());
    }
    match conn.query_row(
        "SELECT imap_name FROM folders WHERE account_id = ?1 AND canonical = ?2 LIMIT 1",
        params![account_id, folder_key],
        |row| row.get(0),
    ) {
        Ok(name) => Ok(name),
        Err(_) if folder_key == "inbox" => Ok("INBOX".into()),
        Err(_) => Err("Unknown folder. Sync the mailbox and try again.".into()),
    }
}

pub fn archive_imap_name(conn: &Connection, account_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT imap_name FROM folders WHERE account_id = ?1 AND canonical = 'archive' LIMIT 1",
        [account_id],
        |row| row.get(0),
    )
    .map_err(|_| {
        "This mailbox has no Archive folder. Sync first (Gmail uses All Mail).".into()
    })
}

pub fn apply_flag_change(
    conn: &Connection,
    message_id: &str,
    seen: Option<bool>,
    flagged: Option<bool>,
) -> Result<(), String> {
    if let Some(seen) = seen {
        conn.execute(
            "UPDATE messages SET unread = ?1 WHERE id = ?2",
            params![i64::from(!seen), message_id],
        )
        .map_err(err)?;
    }
    if let Some(flagged) = flagged {
        conn.execute(
            "UPDATE messages SET flagged = ?1 WHERE id = ?2",
            params![flagged as i64, message_id],
        )
        .map_err(err)?;
    }
    Ok(())
}

pub fn delete_message(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM attachments WHERE message_id = ?1", [id])
        .map_err(err)?;
    conn.execute("DELETE FROM messages WHERE id = ?1", [id])
        .map_err(err)?;
    Ok(())
}

pub fn get_account(conn: &Connection, id: &str) -> Result<Account, String> {
    conn.query_row(
        "SELECT id, address, label, kind, imap_host, imap_port, imap_user,
                smtp_host, smtp_port, smtp_user, trust_tls, auth
         FROM accounts WHERE id = ?1",
        [id],
        account_from_row,
    )
    .map_err(err)
}

pub fn get_account_by_address(conn: &Connection, address: &str) -> Result<Option<Account>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, address, label, kind, imap_host, imap_port, imap_user,
                    smtp_host, smtp_port, smtp_user, trust_tls, auth
             FROM accounts WHERE lower(address) = lower(?1) LIMIT 1",
        )
        .map_err(err)?;
    let mut rows = stmt.query([address]).map_err(err)?;
    match rows.next().map_err(err)? {
        Some(row) => Ok(Some(account_from_row(row).map_err(err)?)),
        None => Ok(None),
    }
}

pub fn list_accounts(conn: &Connection) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, address, label, kind, imap_host, imap_port, imap_user,
                    smtp_host, smtp_port, smtp_user, trust_tls, auth
             FROM accounts ORDER BY label",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| account_from_row(row))
        .map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(err)?);
    }
    Ok(out)
}

pub fn apply_fetch(
    conn: &Connection,
    account_id: &str,
    folders: &[MailFolder],
    messages: &[Message],
    parts: &[StoredPart],
    pop_uidls: &[(String, String)],
) -> Result<Mailbox, String> {
    replace_folders(conn, account_id, folders)?;
    let mut classified = messages.to_vec();
    apply_sender_prefs(conn, &mut classified)?;
    for message in &classified {
        persist_message(conn, message, parts)?;
    }
    remember_pop_uidls(conn, account_id, pop_uidls)?;
    prune_stale_inbox(conn, account_id)?;
    if messages
        .iter()
        .any(|m| m.folder == "sent" && m.id.contains(":sent:"))
    {
        prune_local_sent(conn, account_id)?;
    }
    prune_orphan_attachments(conn)?;
    load_mailbox(conn)
}

pub fn pop_uidls(conn: &Connection, account_id: &str) -> Result<std::collections::HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT uidl FROM pop_uidl WHERE account_id = ?1")
        .map_err(err)?;
    let rows = stmt
        .query_map([account_id], |row| row.get::<_, String>(0))
        .map_err(err)?;
    let mut out = std::collections::HashSet::new();
    for row in rows {
        out.insert(row.map_err(err)?);
    }
    Ok(out)
}

fn remember_pop_uidls(
    conn: &Connection,
    account_id: &str,
    uidls: &[(String, String)],
) -> Result<(), String> {
    for (uidl, message_id) in uidls {
        conn.execute(
            "INSERT OR REPLACE INTO pop_uidl (account_id, uidl, message_id)
             VALUES (?1, ?2, ?3)",
            params![account_id, uidl, message_id],
        )
        .map_err(err)?;
    }
    Ok(())
}

pub fn message_ids(conn: &Connection, account_id: &str) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM messages WHERE account_id = ?1")
        .map_err(err)?;
    let rows = stmt
        .query_map([account_id], |row| row.get::<_, String>(0))
        .map_err(err)?;
    let mut out = HashSet::new();
    for row in rows {
        out.insert(row.map_err(err)?);
    }
    Ok(out)
}

pub fn pref_bool(conn: &Connection, key: &str) -> Result<bool, String> {
    match conn.query_row("SELECT value FROM prefs WHERE key = ?1", [key], |row| {
        row.get::<_, String>(0)
    }) {
        Ok(value) => Ok(value != "0"),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(true),
        Err(other) => Err(other.to_string()),
    }
}

pub fn set_pref(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO prefs (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}

fn fill_class(message: &mut Message) {
    if message.why.is_some() || message.category.is_some() {
        return;
    }
    let class = classify_mail(&message.subject, &message.preview, &message.from_email);
    message.category = class.category.map(|s| s.to_string());
    message.why = Some(class.reason.to_string());
}

fn sender_overrides(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn
        .prepare("SELECT email, feed, hits FROM sender_prefs WHERE hits >= 2")
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(err)?;
    let mut out = HashMap::new();
    for row in rows {
        let (email, feed, _) = row.map_err(err)?;
        out.insert(email.to_lowercase(), feed);
    }
    Ok(out)
}

fn apply_sender_prefs(conn: &Connection, messages: &mut [Message]) -> Result<(), String> {
    let prefs = sender_overrides(conn)?;
    for message in messages {
        if message.folder != "inbox" {
            continue;
        }
        if let Some(feed) = prefs.get(&message.from_email.to_lowercase()) {
            if feed == "reading" {
                message.feed = "reading".into();
                message.category = None;
                message.why = Some("You moved this sender to Reading twice.".into());
            }
        }
    }
    Ok(())
}

pub fn move_to_reading(conn: &Connection, message_id: &str) -> Result<Mailbox, String> {
    let email: String = conn
        .query_row(
            "SELECT from_email FROM messages WHERE id = ?1",
            [message_id],
            |row| row.get(0),
        )
        .map_err(err)?;
    let email = email.trim().to_lowercase();
    conn.execute(
        "UPDATE messages SET feed = 'reading', category = NULL, why = ?1 WHERE id = ?2",
        params!["Moved to Reading.", message_id],
    )
    .map_err(err)?;
    conn.execute(
        "INSERT INTO sender_prefs (email, feed, hits) VALUES (?1, 'reading', 1)
         ON CONFLICT(email) DO UPDATE SET hits = hits + 1, feed = 'reading'",
        [&email],
    )
    .map_err(err)?;
    let hits: i64 = conn
        .query_row(
            "SELECT hits FROM sender_prefs WHERE email = ?1",
            [&email],
            |row| row.get(0),
        )
        .map_err(err)?;
    if hits >= 2 {
        conn.execute(
            "UPDATE messages SET feed = 'reading', category = NULL, why = ?1
             WHERE lower(from_email) = ?2 AND folder = 'inbox'",
            params!["You moved this sender to Reading twice.", email],
        )
        .map_err(err)?;
    }
    load_mailbox(conn)
}

pub fn lock_sender_reading(conn: &Connection, email: &str) -> Result<Mailbox, String> {
    let email = email.trim().to_lowercase();
    conn.execute(
        "INSERT INTO sender_prefs (email, feed, hits) VALUES (?1, 'reading', 2)
         ON CONFLICT(email) DO UPDATE SET hits = max(hits, 2), feed = 'reading'",
        [&email],
    )
    .map_err(err)?;
    conn.execute(
        "UPDATE messages SET feed = 'reading', category = NULL, why = ?1
         WHERE lower(from_email) = ?2 AND folder = 'inbox'",
        params!["You moved this sender to Reading.", email],
    )
    .map_err(err)?;
    load_mailbox(conn)
}

pub fn reset_sender(conn: &Connection, email: &str) -> Result<Mailbox, String> {
    let email = email.trim().to_lowercase();
    conn.execute("DELETE FROM sender_prefs WHERE email = ?1", [&email])
        .map_err(err)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, subject, preview, from_email FROM messages
             WHERE lower(from_email) = ?1 AND folder = 'inbox'",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([&email], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(err)?;
    let mut updates = Vec::new();
    for row in rows {
        let (id, subject, preview, from_email) = row.map_err(err)?;
        let class = classify_mail(&subject, &preview, &from_email);
        updates.push((
            id,
            class.feed.to_string(),
            class.category.map(|s| s.to_string()),
            class.reason.to_string(),
        ));
    }
    drop(stmt);
    for (id, feed, category, why) in updates {
        conn.execute(
            "UPDATE messages SET feed = ?1, category = ?2, why = ?3 WHERE id = ?4",
            params![feed, category, why, id],
        )
        .map_err(err)?;
    }
    load_mailbox(conn)
}

fn folder_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MailFolder> {
    Ok(MailFolder {
        account_id: row.get(0)?,
        canonical: row.get(1)?,
        imap_name: row.get(2)?,
        label: row.get(3)?,
    })
}

fn message_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    let label: Option<String> = row.get(12)?;
    let tone: Option<String> = row.get(13)?;
    Ok(Message {
        id: row.get(0)?,
        account_id: row.get(1)?,
        feed: row.get(2)?,
        from_name: row.get(3)?,
        from_email: row.get(4)?,
        subject: row.get(5)?,
        preview: row.get(6)?,
        body: row.get(7)?,
        received_at: row.get(8)?,
        unread: row.get::<_, i64>(9)? != 0,
        waiting_on: row.get::<_, i64>(10)? != 0,
        flagged: row.get::<_, i64>(15).unwrap_or(0) != 0,
        folder: row.get(11)?,
        hero: match (label, tone) {
            (Some(label), Some(tone)) => Some(Hero { label, tone }),
            _ => None,
        },
        html_body: row.get(14)?,
        attachments: Vec::new(),
        category: row.get::<_, Option<String>>(16).ok().flatten(),
        why: row.get::<_, Option<String>>(17).ok().flatten(),
    })
}

fn attachment_meta_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<(String, Attachment)> {
    Ok((
        row.get(1)?,
        Attachment {
            id: row.get(0)?,
            filename: row.get(2)?,
            content_type: row.get(3)?,
            size: row.get::<_, i64>(4)? as u64,
            content_id: row.get(5)?,
            inline: row.get::<_, i64>(6)? != 0,
            stored: row.get::<_, i64>(7)? != 0,
        },
    ))
}

fn account_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        address: row.get(1)?,
        label: row.get(2)?,
        kind: row.get(3)?,
        imap_host: row.get(4)?,
        imap_port: row.get::<_, Option<i64>>(5)?.map(|p| p as u16),
        imap_user: row.get(6)?,
        smtp_host: row.get(7)?,
        smtp_port: row.get::<_, Option<i64>>(8)?.map(|p| p as u16),
        smtp_user: row.get(9)?,
        trust_tls: row.get::<_, i64>(10).unwrap_or(0) != 0,
        auth: row
            .get::<_, String>(11)
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "password".into()),
    })
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
