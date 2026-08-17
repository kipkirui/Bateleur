use bateleur_core::{classify_feed, html_to_plain, preview_text, Account, Hero, Message};
use imap::types::Flag;
use mail_parser::{MessageParser, PartType};
use rustls::pki_types::ServerName;
use rustls::{ClientConnection, StreamOwned};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;

pub fn fetch_inbox(account: &Account, password: &str) -> Result<Vec<Message>, String> {
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
    let mut session = client.login(user, password).map_err(|e| friendly(e.0))?;
    let mailbox = session.select("INBOX").map_err(friendly)?;
    let exists = mailbox.exists;
    if exists == 0 {
        let _ = session.logout();
        return Ok(Vec::new());
    }
    let start = exists.saturating_sub(39).max(1);
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
        let hero = if feed == "reading" {
            Some(Hero {
                label: domain.to_string(),
                tone: "paper".into(),
            })
        } else {
            None
        };
        out.push(Message {
            id: format!("{}:{uid}", account.id),
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
            folder: "inbox".into(),
            hero,
        });
    }
    let _ = session.logout();
    Ok(out)
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
