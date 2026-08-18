use crate::attach::StoredPart;
use crate::parse::{self, FetchResult};
use bateleur_core::{classify_imap_folder, Account, MailFolder, Message};
use imap::extensions::idle::SetReadTimeout;
use imap::types::{Flag, NameAttribute};
use rustls::pki_types::ServerName;
use rustls::{ClientConnection, StreamOwned};
use std::io::{self, Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;

type TlsStream = StreamOwned<ClientConnection, TcpStream>;
type Session = imap::Session<ImapTls>;

struct ImapTls {
    inner: TlsStream,
}

impl Read for ImapTls {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buf)
    }
}

impl Write for ImapTls {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.inner.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

impl SetReadTimeout for ImapTls {
    fn set_read_timeout(&mut self, timeout: Option<Duration>) -> imap::error::Result<()> {
        self.inner
            .get_ref()
            .set_read_timeout(timeout)
            .map_err(imap::Error::Io)
    }
}

pub fn fetch_account(account: &Account, password: &str) -> Result<FetchResult, String> {
    let mut session = login(account, password)?;
    let folders = list_folders(&mut session, &account.id)?;
    let mut messages = Vec::new();
    let mut parts = Vec::new();
    let mut custom_fetched = 0;
    for folder in &folders {
        let limit = match folder.canonical.as_str() {
            "inbox" => 40,
            "sent" | "drafts" | "junk" => 30,
            "archive" => {
                if is_all_mail(&folder.imap_name) {
                    continue;
                }
                40
            }
            "custom" => {
                if custom_fetched >= 8 {
                    continue;
                }
                custom_fetched += 1;
                15
            }
            _ => continue,
        };
        match fetch_named(&mut session, account, folder, limit) {
            Ok((mut batch, mut batch_parts)) => {
                messages.append(&mut batch);
                parts.append(&mut batch_parts);
            }
            Err(err) => {
                if folder.canonical == "inbox" {
                    let _ = session.logout();
                    return Err(err);
                }
            }
        }
    }
    let _ = session.logout();
    Ok(FetchResult {
        messages,
        folders,
        parts,
        pop_uidls: Vec::new(),
    })
}

pub fn append_sent(
    account: &Account,
    password: &str,
    rfc822: &[u8],
) -> Result<Option<(Message, Vec<StoredPart>)>, String> {
    let mut session = login(account, password)?;
    let folders = list_folders(&mut session, &account.id)?;
    let sent = folders
        .iter()
        .find(|f| f.canonical == "sent")
        .cloned()
        .or_else(|| ensure_sent_mailbox(&mut session, &account.id).ok());
    let Some(sent) = sent else {
        let _ = session.logout();
        return Ok(None);
    };
    session
        .append_with_flags(&sent.imap_name, rfc822, &[Flag::Seen])
        .map_err(friendly)?;
    let fetched = fetch_named(&mut session, account, &sent, 1).ok();
    let _ = session.logout();
    Ok(fetched.and_then(|(mut batch, parts)| batch.pop().map(|message| (message, parts))))
}

pub fn append_draft(
    account: &Account,
    password: &str,
    rfc822: &[u8],
) -> Result<Option<(Message, Vec<StoredPart>, String)>, String> {
    let mut session = login(account, password)?;
    let folders = list_folders(&mut session, &account.id)?;
    let drafts = folders
        .iter()
        .find(|f| f.canonical == "drafts")
        .cloned()
        .or_else(|| ensure_drafts_mailbox(&mut session, &account.id).ok());
    let Some(drafts) = drafts else {
        let _ = session.logout();
        return Ok(None);
    };
    session
        .append_with_flags(&drafts.imap_name, rfc822, &[Flag::Seen, Flag::Draft])
        .map_err(friendly)?;
    let fetched = fetch_named(&mut session, account, &drafts, 1).ok();
    let _ = session.logout();
    Ok(fetched.and_then(|(mut batch, parts)| {
        batch
            .pop()
            .map(|message| (message, parts, drafts.imap_name.clone()))
    }))
}

pub fn delete_uid(
    account: &Account,
    password: &str,
    imap_mailbox: &str,
    uid: u32,
) -> Result<(), String> {
    let mut session = login(account, password)?;
    session.select(imap_mailbox).map_err(friendly)?;
    let uid = uid.to_string();
    session
        .uid_store(&uid, "+FLAGS.SILENT (\\Deleted)")
        .map_err(friendly)?;
    session.expunge().map_err(friendly)?;
    let _ = session.logout();
    Ok(())
}

pub fn wait_inbox(account: &Account, password: &str, timeout: Duration) -> Result<(), String> {
    let mut session = login(account, password)?;
    session.select("INBOX").map_err(friendly)?;
    let waited = {
        let mut handle = session.idle().map_err(friendly)?;
        handle.set_keepalive(timeout);
        handle.wait_with_timeout(timeout).map_err(friendly)
    };
    let _ = session.logout();
    waited.map(|_| ())
}

pub fn set_flags(
    account: &Account,
    password: &str,
    imap_mailbox: &str,
    uid: u32,
    seen: Option<bool>,
    flagged: Option<bool>,
) -> Result<(), String> {
    if seen.is_none() && flagged.is_none() {
        return Ok(());
    }
    let mut session = login(account, password)?;
    session.select(imap_mailbox).map_err(friendly)?;
    let uid = uid.to_string();
    if let Some(on) = seen {
        let query = if on {
            "+FLAGS.SILENT (\\Seen)"
        } else {
            "-FLAGS.SILENT (\\Seen)"
        };
        session.uid_store(&uid, query).map_err(friendly)?;
    }
    if let Some(on) = flagged {
        let query = if on {
            "+FLAGS.SILENT (\\Flagged)"
        } else {
            "-FLAGS.SILENT (\\Flagged)"
        };
        session.uid_store(&uid, query).map_err(friendly)?;
    }
    let _ = session.logout();
    Ok(())
}

pub fn archive_uid(
    account: &Account,
    password: &str,
    source_imap: &str,
    dest_imap: &str,
    uid: u32,
) -> Result<(), String> {
    if source_imap.eq_ignore_ascii_case(dest_imap) {
        return Err("That letter is already in Archive.".into());
    }
    let mut session = login(account, password)?;
    session.select(source_imap).map_err(friendly)?;
    let uid = uid.to_string();
    if session.uid_mv(&uid, dest_imap).is_err() {
        session
            .uid_copy(&uid, quote_mailbox(dest_imap))
            .map_err(friendly)?;
        session
            .uid_store(&uid, "+FLAGS.SILENT (\\Deleted)")
            .map_err(friendly)?;
        session.expunge().map_err(friendly)?;
    }
    let _ = session.logout();
    Ok(())
}

fn quote_mailbox(name: &str) -> String {
    if name.starts_with('"') && name.ends_with('"') {
        return name.to_string();
    }
    format!("\"{}\"", name.replace('\\', "\\\\").replace('"', "\\\""))
}

fn login(account: &Account, password: &str) -> Result<Session, String> {
    let host = account
        .imap_host
        .as_deref()
        .ok_or("IMAP host is missing.")?;
    let port = account.imap_port.unwrap_or(993);
    let user = account
        .imap_user
        .as_deref()
        .filter(|u| !u.is_empty())
        .unwrap_or(account.address.as_str());
    let client = connect_tls(host, port, account.trust_tls)?;
    if crate::oauth::uses_xoauth2(account) {
        let auth = crate::oauth::Xoauth2 {
            user: user.to_string(),
            access_token: password.to_string(),
        };
        return client
            .authenticate("XOAUTH2", &auth)
            .map_err(|e| friendly(e.0));
    }
    let password = compact_secret(password);

    if is_gmail(account) && !looks_like_google_app_password(&password) {
        return Err(
            "Gmail IMAP will not accept your Google account password, even if it is correct. \
             Turn on 2-Step Verification, then create a 16-letter App password at \
             myaccount.google.com/apppasswords, or use Sign in with Google in Settings. Also enable IMAP in Gmail Settings → \
             Forwarding and POP/IMAP."
                .into(),
        );
    }

    client.login(user, password).map_err(|e| friendly(e.0))
}

fn list_folders(session: &mut Session, account_id: &str) -> Result<Vec<MailFolder>, String> {
    let listed = session
        .list(Some(""), Some("*"))
        .map_err(friendly)?;
    let mut out = Vec::new();
    let mut archives = Vec::new();
    let mut seen_canonical = std::collections::HashSet::new();
    for name in listed.iter() {
        let tokens: Vec<String> = name
            .attributes()
            .iter()
            .map(attr_token)
            .collect();
        let refs: Vec<&str> = tokens.iter().map(String::as_str).collect();
        let Some(class) = classify_imap_folder(name.name(), &refs) else {
            continue;
        };
        let folder = MailFolder {
            account_id: account_id.to_string(),
            canonical: class.canonical.to_string(),
            imap_name: name.name().to_string(),
            label: class.label,
        };
        if class.canonical == "archive" {
            archives.push(folder);
            continue;
        }
        if class.canonical != "custom" && !seen_canonical.insert(class.canonical) {
            continue;
        }
        out.push(folder);
    }
    if let Some(archive) = pick_archive(archives) {
        out.push(archive);
    }
    if !out.iter().any(|f| f.canonical == "inbox") {
        out.insert(
            0,
            MailFolder {
                account_id: account_id.to_string(),
                canonical: "inbox".into(),
                imap_name: "INBOX".into(),
                label: "Inbox".into(),
            },
        );
    }
    out.sort_by(|a, b| folder_rank(&a.canonical).cmp(&folder_rank(&b.canonical)));
    Ok(out)
}

fn ensure_sent_mailbox(session: &mut Session, account_id: &str) -> Result<MailFolder, String> {
    for candidate in ["Sent", "Sent Items", "INBOX.Sent"] {
        if session.create(candidate).is_ok() || session.select(candidate).is_ok() {
            return Ok(MailFolder {
                account_id: account_id.to_string(),
                canonical: "sent".into(),
                imap_name: candidate.into(),
                label: "Sent".into(),
            });
        }
    }
    Err("Could not find or create a Sent folder.".into())
}

fn ensure_drafts_mailbox(session: &mut Session, account_id: &str) -> Result<MailFolder, String> {
    for candidate in ["Drafts", "INBOX.Drafts"] {
        if session.create(candidate).is_ok() || session.select(candidate).is_ok() {
            return Ok(MailFolder {
                account_id: account_id.to_string(),
                canonical: "drafts".into(),
                imap_name: candidate.into(),
                label: "Drafts".into(),
            });
        }
    }
    Err("Could not find or create a Drafts folder.".into())
}

fn fetch_named(
    session: &mut Session,
    account: &Account,
    folder: &MailFolder,
    limit: u32,
) -> Result<(Vec<Message>, Vec<StoredPart>), String> {
    let mailbox = session.select(&folder.imap_name).map_err(friendly)?;
    let exists = mailbox.exists;
    if exists == 0 {
        return Ok((Vec::new(), Vec::new()));
    }
    let start = exists.saturating_sub(limit.saturating_sub(1)).max(1);
    let seq = format!("{start}:{exists}");
    let fetches = session
        .fetch(&seq, "(UID FLAGS RFC822)")
        .map_err(friendly)?;

    let mut out = Vec::new();
    let mut parts = Vec::new();
    for fetch in fetches.iter() {
        let Some(uid) = fetch.uid else { continue };
        let Some(raw) = fetch.body() else {
            continue;
        };
        let unread = !fetch.flags().iter().any(|flag| matches!(flag, Flag::Seen));
        let flagged = fetch
            .flags()
            .iter()
            .any(|flag| matches!(flag, Flag::Flagged));
        let folder_id = message_folder(&folder.canonical, &folder.imap_name);
        let id = format!("{}:{folder_id}:{uid}", account.id);
        let Some((message, extracted)) =
            parse::from_rfc822(&account.id, &folder_id, &id, raw, unread, flagged)
        else {
            continue;
        };
        parts.extend(extracted);
        out.push(message);
    }
    Ok((out, parts))
}

fn message_folder(canonical: &str, imap_name: &str) -> String {
    if canonical == "custom" {
        format!("custom:{imap_name}")
    } else {
        canonical.to_string()
    }
}

fn is_all_mail(imap_name: &str) -> bool {
    archive_rank(imap_name) == 1
}

fn pick_archive(mut folders: Vec<MailFolder>) -> Option<MailFolder> {
    folders.sort_by_key(|f| archive_rank(&f.imap_name));
    folders.into_iter().next()
}

fn archive_rank(imap_name: &str) -> u8 {
    let lower = imap_name.to_ascii_lowercase();
    let leaf = lower
        .rsplit(['/', '.', '\\'])
        .next()
        .unwrap_or(lower.as_str());
    if leaf == "archive" {
        0
    } else if lower.contains("all mail") || leaf == "all" {
        1
    } else {
        2
    }
}

fn folder_rank(canonical: &str) -> u8 {
    match canonical {
        "inbox" => 0,
        "sent" => 1,
        "drafts" => 2,
        "junk" => 3,
        "archive" => 5,
        _ => 4,
    }
}

fn attr_token(attr: &NameAttribute<'_>) -> String {
    match attr {
        NameAttribute::NoInferiors => "\\Noinferiors".into(),
        NameAttribute::NoSelect => "\\Noselect".into(),
        NameAttribute::Marked => "\\Marked".into(),
        NameAttribute::Unmarked => "\\Unmarked".into(),
        NameAttribute::Custom(value) => value.to_string(),
    }
}

fn connect_tls(
    host: &str,
    port: u16,
    trust_anyway: bool,
) -> Result<imap::Client<ImapTls>, String> {
    let config = crate::tls::client_config(trust_anyway)?;
    let name = ServerName::try_from(host.to_string())
        .map_err(|_| format!("Invalid IMAP host: {host}"))?;
    let conn = ClientConnection::new(Arc::new(config), name).map_err(|e| format!("TLS: {e}"))?;
    let tcp = TcpStream::connect((host, port))
        .map_err(|e| format!("Could not reach {host}:{port} ({e})"))?;
    tcp.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    let mut client = imap::Client::new(ImapTls {
        inner: StreamOwned::new(conn, tcp),
    });
    client.read_greeting().map_err(friendly)?;
    Ok(client)
}

pub(crate) fn compact_secret(secret: &str) -> String {
    secret.chars().filter(|c| !c.is_whitespace()).collect()
}

pub(crate) fn is_gmail(account: &Account) -> bool {
    let host = account.imap_host.as_deref().unwrap_or_default();
    let address = account.address.as_str();
    host.contains("gmail")
        || address.ends_with("@gmail.com")
        || address.ends_with("@googlemail.com")
}

pub(crate) fn looks_like_google_app_password(secret: &str) -> bool {
    let compact = compact_secret(secret);
    compact.len() == 16 && compact.chars().all(|c| c.is_ascii_alphabetic())
}

fn friendly<E: std::fmt::Display>(e: E) -> String {
    let raw = e.to_string();
    let lower = raw.to_lowercase();
    if lower.contains("unknownissuer")
        || lower.contains("certificate")
        || lower.contains("cert")
        || lower.contains("trust")
        || lower.contains("tls")
    {
        return format!(
            "The mail server's TLS certificate is not trusted (often a missing CA chain). Tick “Trust this server's certificate” in Settings and try again. ({raw})"
        );
    }
    if lower.contains("authenticationfailed")
        || lower.contains("authentication")
        || lower.contains("credentials")
        || (lower.contains("login") && !lower.contains("certificate"))
    {
        return format!(
            "IMAP login was rejected. If this is Gmail, use a 16-letter App password, not your Google password. Server said: {raw}"
        );
    }
    if lower.contains("timed out") || lower.contains("connection") {
        return format!("Could not reach the IMAP host. Check the server and port. ({raw})");
    }
    raw
}
