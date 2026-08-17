use bateleur_core::{Account, Hero, MailFolder, Mailbox, Message};
use rusqlite::{params, Connection};

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
    Ok(conn)
}

pub fn load_mailbox(conn: &Connection) -> Result<Mailbox, String> {
    let mut accounts = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT id, address, label, kind, imap_host, imap_port, imap_user,
                    smtp_host, smtp_port, smtp_user, trust_tls
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
                    flagged
             FROM messages ORDER BY received_at DESC",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |row| message_from_row(row))
        .map_err(err)?;
    for row in rows {
        messages.push(row.map_err(err)?);
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

    Ok(Mailbox {
        accounts,
        messages,
        folders,
    })
}

pub fn upsert_account(conn: &Connection, account: &Account) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO accounts
         (id, address, label, kind, imap_host, imap_port, imap_user, smtp_host, smtp_port, smtp_user, trust_tls)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn upsert_message(conn: &Connection, message: &Message) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO messages
         (id, account_id, feed, from_name, from_email, subject, preview, body,
          received_at, unread, waiting_on, folder, hero_label, hero_tone, html_body, flagged)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
    conn.execute("DELETE FROM messages WHERE account_id = ?1", [id])
        .map_err(err)?;
    conn.execute("DELETE FROM folders WHERE account_id = ?1", [id])
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
    conn.execute("DELETE FROM messages WHERE id = ?1", [id])
        .map_err(err)?;
    Ok(())
}

pub fn get_account(conn: &Connection, id: &str) -> Result<Account, String> {
    conn.query_row(
        "SELECT id, address, label, kind, imap_host, imap_port, imap_user,
                smtp_host, smtp_port, smtp_user, trust_tls
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
                    smtp_host, smtp_port, smtp_user, trust_tls
             FROM accounts WHERE lower(address) = lower(?1) LIMIT 1",
        )
        .map_err(err)?;
    let mut rows = stmt.query([address]).map_err(err)?;
    match rows.next().map_err(err)? {
        Some(row) => Ok(Some(account_from_row(row).map_err(err)?)),
        None => Ok(None),
    }
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
    })
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
    })
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
