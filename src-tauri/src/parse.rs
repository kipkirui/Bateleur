use crate::attach::{self, StoredPart};
use bateleur_core::{classify_mail, html_to_plain, preview_text, Hero, MailFolder, Message};
use mail_parser::{MessageParser, PartType};

pub struct FetchResult {
    pub messages: Vec<Message>,
    pub folders: Vec<MailFolder>,
    pub parts: Vec<StoredPart>,
    pub pop_uidls: Vec<(String, String)>,
}

pub fn from_rfc822(
    account_id: &str,
    folder: &str,
    id: &str,
    raw: &[u8],
    unread: bool,
    flagged: bool,
) -> Option<(Message, Vec<StoredPart>)> {
    let parsed = MessageParser::default().parse(raw)?;
    let (from_name, from_email) = from_parts(&parsed);
    let subject = html_to_plain(parsed.subject().unwrap_or("(no subject)"));
    let (body, html_body) = bodies(&parsed);
    let preview = preview_text(&body, 180);
    let class = classify_mail(&subject, &preview, &from_email);
    let feed = class.feed.to_string();
    let domain = from_email.split('@').nth(1).unwrap_or("mail");
    let hero = if feed == "reading" && folder == "inbox" {
        Some(Hero {
            label: domain.to_string(),
            tone: "paper".into(),
        })
    } else {
        None
    };
    let extracted = attach::extract(&parsed, id);
    let attachments = extracted.iter().map(|p| p.meta.clone()).collect();
    Some((
        Message {
            id: id.to_string(),
            account_id: account_id.to_string(),
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
                .unwrap_or_else(chrono_fallback),
            unread,
            waiting_on: false,
            flagged,
            folder: folder.to_string(),
            hero,
            attachments,
            category: class.category.map(|s| s.to_string()),
            why: Some(class.reason.to_string()),
        },
        extracted,
    ))
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
