use bateleur_core::{
    classify_feed, classify_imap_folder, html_to_plain, preview_text, Account, Hero, MailFolder,
    Message,
};
use imap::types::{Flag, NameAttribute};
use mail_parser::{MessageParser, PartType};
use rustls::pki_types::ServerName;
use rustls::{ClientConnection, StreamOwned};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;

type TlsStream = StreamOwned<ClientConnection, TcpStream>;
type Session = imap::Session<TlsStream>;

pub struct FetchResult {
    pub messages: Vec<Message>,
    pub folders: Vec<MailFolder>,
}

pub fn fetch_account(account: &Account, password: &str) -> Result<FetchResult, String> {
    let mut session = login(account, password)?;
    let folders = list_folders(&mut session, &account.id)?;
    let mut messages = Vec::new();
    let mut custom_fetched = 0;
    for folder in &folders {
        let limit = match folder.canonical.as_str() {
            "inbox" => 40,
            "sent" | "drafts" | "junk" => 30,
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
            Ok(mut batch) => messages.append(&mut batch),
            Err(err) => {
                if folder.canonical == "inbox" {
                    let _ = session.logout();
                    return Err(err);
                }
            }
        }
    }
    let _ = session.logout();
    Ok(FetchResult { messages, folders })
}

pub fn append_sent(
    account: &Account,
    password: &str,
    rfc822: &[u8],
) -> Result<Option<Message>, String> {
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
    Ok(fetched.and_then(|mut batch| batch.pop()))
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
    let password = compact_secret(password);

    if is_gmail(account) && !looks_like_google_app_password(&password) {
        return Err(
            "Gmail IMAP will not accept your Google account password, even if it is correct. \
             Turn on 2-Step Verification, then create a 16-letter App password at \
             myaccount.google.com/apppasswords. Also enable IMAP in Gmail Settings → \
             Forwarding and POP/IMAP."
                .into(),
        );
    }

    let client = connect_tls(host, port, account.trust_tls)?;
    client.login(user, password).map_err(|e| friendly(e.0))
}

fn list_folders(session: &mut Session, account_id: &str) -> Result<Vec<MailFolder>, String> {
    let listed = session
        .list(Some(""), Some("*"))
        .map_err(friendly)?;
    let mut out = Vec::new();
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
        if class.canonical != "custom" && !seen_canonical.insert(class.canonical) {
            continue;
        }
        out.push(MailFolder {
            account_id: account_id.to_string(),
            canonical: class.canonical.to_string(),
            imap_name: name.name().to_string(),
            label: class.label,
        });
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

fn fetch_named(
    session: &mut Session,
    account: &Account,
    folder: &MailFolder,
    limit: u32,
) -> Result<Vec<Message>, String> {
    let mailbox = session.select(&folder.imap_name).map_err(friendly)?;
    let exists = mailbox.exists;
    if exists == 0 {
        return Ok(Vec::new());
    }
    let start = exists.saturating_sub(limit.saturating_sub(1)).max(1);
    let seq = format!("{start}:{exists}");
    let fetches = session
        .fetch(&seq, "(UID FLAGS RFC822)")
        .map_err(friendly)?;

    let mut out = Vec::new();
    for fetch in fetches.iter() {
        let Some(uid) = fetch.uid else { continue };
        let Some(raw) = fetch.body() else {
            continue;
        };
        let Some(parsed) = MessageParser::default().parse(raw) else {
            continue;
        };
        let unread = !fetch.flags().iter().any(|flag| matches!(flag, Flag::Seen));
        let (from_name, from_email) = from_parts(&parsed);
        let subject = html_to_plain(parsed.subject().unwrap_or("(no subject)"));
        let (body, html_body) = bodies(&parsed);
        let preview = preview_text(&body, 180);
        let feed = classify_feed(&subject, &preview, &from_email).to_string();
        let domain = from_email.split('@').nth(1).unwrap_or("mail");
        let hero = if feed == "reading" && folder.canonical == "inbox" {
            Some(Hero {
                label: domain.to_string(),
                tone: "paper".into(),
            })
        } else {
            None
        };
        let folder_id = message_folder(&folder.canonical, &folder.imap_name);
        out.push(Message {
            id: format!("{}:{folder_id}:{uid}", account.id),
            account_id: account.id.clone(),
            feed,
            from_name,
            from_email,
            subject,
            preview,
            body,
            html_body,
            received_at: parsed
                .date()
                .map(|d| d.to_rfc3339())
                .unwrap_or_else(|| chrono_fallback()),
            unread,
            waiting_on: false,
            folder: folder_id,
            hero,
        });
    }
    Ok(out)
}

fn message_folder(canonical: &str, imap_name: &str) -> String {
    if canonical == "custom" {
        format!("custom:{imap_name}")
    } else {
        canonical.to_string()
    }
}

fn folder_rank(canonical: &str) -> u8 {
    match canonical {
        "inbox" => 0,
        "sent" => 1,
        "drafts" => 2,
        "junk" => 3,
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
) -> Result<imap::Client<StreamOwned<ClientConnection, TcpStream>>, String> {
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
    let mut client = imap::Client::new(StreamOwned::new(conn, tcp));
    client.read_greeting().map_err(friendly)?;
    Ok(client)
}

fn compact_secret(secret: &str) -> String {
    secret.chars().filter(|c| !c.is_whitespace()).collect()
}

fn is_gmail(account: &Account) -> bool {
    let host = account.imap_host.as_deref().unwrap_or_default();
    let address = account.address.as_str();
    host.contains("gmail")
        || address.ends_with("@gmail.com")
        || address.ends_with("@googlemail.com")
}

fn looks_like_google_app_password(secret: &str) -> bool {
    let compact = compact_secret(secret);
    compact.len() == 16 && compact.chars().all(|c| c.is_ascii_alphabetic())
}

fn from_parts(parsed: &mail_parser::Message<'_>) -> (String, String) {
    let Some(from) = parsed.from() else {
        return ("Unknown".into(), String::new());
    };
    let Some(addr) = from.first() else {
        return ("Unknown".into(), String::new());
    };
    let email = addr.address().unwrap_or_default().to_string();
    let name = addr
        .name()
        .map(|n| html_to_plain(&n.to_string()))
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| email.clone());
    (name, email)
}

fn bodies(parsed: &mail_parser::Message<'_>) -> (String, Option<String>) {
    let html = first_html_part(parsed);
    let text = first_plain_part(parsed)
        .map(|t| strip_css_noise(&html_to_plain(&t)))
        .filter(|t| !t.is_empty())
        .or_else(|| html.as_deref().map(|h| strip_css_noise(&html_to_plain(h))))
        .unwrap_or_default();
    (text, html)
}

fn first_html_part(parsed: &mail_parser::Message<'_>) -> Option<String> {
    for part in &parsed.parts {
        if let PartType::Html(html) = &part.body {
            let value = html.as_ref();
            if value.contains('<') {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn first_plain_part(parsed: &mail_parser::Message<'_>) -> Option<String> {
    for part in &parsed.parts {
        if let PartType::Text(text) = &part.body {
            let value = text.as_ref();
            if !value.trim().is_empty() && !value.to_ascii_lowercase().contains("<html") {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn strip_css_noise(text: &str) -> String {
    let mut kept = Vec::new();
    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if t.starts_with(':')
            || t.starts_with('@')
            || t.starts_with("/*")
            || t.contains("color-scheme")
            || t.contains("supported-color-schemes")
            || t.contains("mix-blend-mode")
            || t.contains("font-face")
            || (t.contains('{') && t.contains('}') && t.contains(':'))
        {
            continue;
        }
        kept.push(t);
    }
    kept.join(" ")
}

fn chrono_fallback() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
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
