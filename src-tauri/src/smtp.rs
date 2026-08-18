use crate::attach::{self, StoredPart};
use bateleur_core::{preview_text, Account, Message, SendDraft};
use lettre::message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::{Credentials, Mechanism};
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{Message as SmtpMessage, SmtpTransport, Transport};
use std::str::FromStr;

pub fn send(account: &Account, password: &str, draft: &SendDraft) -> Result<(Message, Vec<u8>, Vec<StoredPart>), String> {
    if !draft.confirm {
        return Err("Send is confirm-gated. Confirm the letter before it goes out.".into());
    }
    let host = account
        .smtp_host
        .as_deref()
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .map(|h| h.to_string())
        .or_else(|| bateleur_core::guess_servers(&account.address).map(|g| g.smtp_host))
        .ok_or("SMTP host is missing. Add it under Settings → Mail.")?;
    let port = account.smtp_port.unwrap_or_else(|| {
        bateleur_core::guess_servers(&account.address)
            .map(|g| g.smtp_port)
            .unwrap_or(587)
    });
    let user = account
        .smtp_user
        .as_deref()
        .map(str::trim)
        .filter(|u| !u.is_empty())
        .unwrap_or(account.address.as_str());
    let oauth = crate::oauth::uses_xoauth2(account);
    let secret = if oauth {
        password.to_string()
    } else {
        password.chars().filter(|c| !c.is_whitespace()).collect()
    };

    let from = mailbox_addr(Some(&account.label), &account.address)?;
    let recipients = parse_recipients(&draft.to)?;
    let cc = parse_address_list(&draft.cc, "Cc")?;
    let bcc = parse_address_list(&draft.bcc, "Bcc")?;
    let subject = draft.subject.trim();
    let body = draft.body.trim_end().to_string();
    if body.trim().is_empty() {
        return Err("The letter is empty.".into());
    }

    let local_id = format!("sent:{}:{}", account.id, uuid::Uuid::new_v4());
    let rfc_id = format!("{}@bateleur", uuid::Uuid::new_v4());
    let mut builder = SmtpMessage::builder().from(from.clone());
    for rcpt in &recipients {
        builder = builder.to(rcpt.clone());
    }
    for rcpt in &cc {
        builder = builder.cc(rcpt.clone());
    }
    for rcpt in &bcc {
        builder = builder.bcc(rcpt.clone());
    }
    builder = builder
        .subject(if subject.is_empty() {
            "(no subject)"
        } else {
            subject
        })
        .message_id(Some(format!("<{rfc_id}>")));
    if let Some(parent) = draft
        .in_reply_to
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let ids: Vec<String> = parent
            .split_whitespace()
            .map(wrap_msgid)
            .filter(|id| id.len() > 2)
            .collect();
        if let Some(first) = ids.first() {
            builder = builder.in_reply_to(first.clone());
            builder = builder.references(ids.join(" "));
        }
    }
    let html = draft
        .html
        .as_deref()
        .map(str::trim)
        .filter(|h| !h.is_empty() && looks_like_markup(h));
    let parts = attach::from_draft(&local_id, &draft.attachments)?;
    let email = build_letter(builder, &body, html, &parts)?;

    let creds = Credentials::new(user.to_string(), secret);
    let mailer = transport(&host, port, account.trust_tls, creds, oauth)?;
    mailer.send(&email).map_err(friendly)?;
    let rfc822 = email.formatted();

    let to_line = recipients
        .iter()
        .map(|m| m.email.to_string())
        .collect::<Vec<_>>()
        .join(", ");
    let message = Message {
        id: local_id,
        account_id: account.id.clone(),
        feed: "reading".into(),
        from_name: from.name.unwrap_or_else(|| account.address.clone()),
        from_email: account.address.clone(),
        subject: if subject.is_empty() {
            "(no subject)".into()
        } else {
            subject.to_string()
        },
        preview: preview_text(&format!("{to_line} {body}"), 180),
        body,
        html_body: draft.html.clone().filter(|h| looks_like_markup(h)),
        received_at: chrono::Utc::now().to_rfc3339(),
        unread: false,
        waiting_on: false,
        flagged: false,
        folder: "sent".into(),
        hero: None,
        attachments: parts.iter().map(|p| p.meta.clone()).collect(),
        category: None,
        why: None,
        to_email: to_line.to_ascii_lowercase(),
        cc_email: cc
            .iter()
            .map(|m| m.email.to_string())
            .collect::<Vec<_>>()
            .join(", ")
            .to_ascii_lowercase(),
        rfc_id: Some(rfc_id),
        in_reply_to: draft
            .in_reply_to
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
        invite: None,
    };
    Ok((message, rfc822, parts))
}

fn build_letter(
    builder: lettre::message::MessageBuilder,
    body: &str,
    html: Option<&str>,
    parts: &[StoredPart],
) -> Result<SmtpMessage, String> {
    let alternative = if let Some(html) = html {
        MultiPart::alternative()
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(body.to_string()),
            )
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_HTML)
                    .body(wrap_html(html)),
            )
    } else {
        MultiPart::alternative().singlepart(
            SinglePart::builder()
                .header(ContentType::TEXT_PLAIN)
                .body(body.to_string()),
        )
    };
    if parts.is_empty() && html.is_some() {
        return builder
            .multipart(alternative)
            .map_err(|e| format!("Could not build the letter ({e})"));
    }
    if parts.is_empty() {
        return builder
            .body(body.to_string())
            .map_err(|e| format!("Could not build the letter ({e})"));
    }
    let mut mixed = MultiPart::mixed().multipart(alternative);
    for part in parts {
        let ct = ContentType::parse(&part.meta.content_type)
            .unwrap_or_else(|_| ContentType::parse("application/octet-stream").expect("octet"));
        mixed = mixed.singlepart(
            Attachment::new(part.meta.filename.clone()).body(part.bytes.clone(), ct),
        );
    }
    builder
        .multipart(mixed)
        .map_err(|e| format!("Could not build the letter ({e})"))
}

fn transport(
    host: &str,
    port: u16,
    trust_anyway: bool,
    creds: Credentials,
    xoauth2: bool,
) -> Result<SmtpTransport, String> {
    let tls = tls_parameters(host, trust_anyway)?;
    let builder = if port == 465 {
        SmtpTransport::relay(host)
            .map_err(|e| format!("SMTP TLS ({e})"))?
            .tls(Tls::Wrapper(tls))
    } else {
        SmtpTransport::starttls_relay(host)
            .map_err(|e| format!("SMTP STARTTLS ({e})"))?
            .tls(Tls::Required(tls))
    };
    let builder = if xoauth2 {
        builder.authentication(vec![Mechanism::Xoauth2])
    } else {
        builder
    };
    Ok(builder.port(port).credentials(creds).build())
}

fn tls_parameters(host: &str, trust_anyway: bool) -> Result<TlsParameters, String> {
    TlsParameters::builder(host.to_string())
        .dangerous_accept_invalid_certs(trust_anyway)
        .build()
        .map_err(|e| format!("SMTP TLS ({e})"))
}

fn looks_like_markup(value: &str) -> bool {
    value.contains('<') && value.contains('>')
}

fn wrap_html(html: &str) -> String {
    if html.to_ascii_lowercase().contains("<html") {
        html.to_string()
    } else {
        format!(
            "<!doctype html><html><body style=\"font-family: Georgia, serif; font-size: 16px; line-height: 1.5; color: #1c1917;\">{html}</body></html>"
        )
    }
}

fn parse_recipients(to: &str) -> Result<Vec<Mailbox>, String> {
    let out = parse_address_list(to, "To")?;
    if out.is_empty() {
        return Err("To needs at least one address.".into());
    }
    Ok(out)
}

fn parse_address_list(value: &str, field: &str) -> Result<Vec<Mailbox>, String> {
    let mut out = Vec::new();
    for part in value.split([',', ';']) {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        out.push(Mailbox::from_str(part).map_err(|_| {
            format!("“{part}” is not a valid {field} address. Use name@host, comma-separated for several.")
        })?);
    }
    Ok(out)
}

fn wrap_msgid(raw: &str) -> String {
    let value = raw.trim().trim_matches(|c| c == '<' || c == '>').trim();
    if value.is_empty() {
        String::new()
    } else {
        format!("<{value}>")
    }
}

fn mailbox_addr(name: Option<&str>, address: &str) -> Result<Mailbox, String> {
    let addr = lettre::Address::from_str(address)
        .map_err(|_| format!("From address is not valid ({address})."))?;
    let display = name
        .map(str::trim)
        .filter(|n| !n.is_empty() && !n.eq_ignore_ascii_case(address))
        .map(|n| n.to_string());
    Ok(Mailbox::new(display, addr))
}

fn friendly(err: lettre::transport::smtp::Error) -> String {
    let raw = err.to_string();
    let lower = raw.to_lowercase();
    if lower.contains("authentication") || lower.contains("credentials") || lower.contains("535") {
        return format!(
            "SMTP login was rejected. If this is Gmail, use a 16-letter App password. Server said: {raw}"
        );
    }
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("handshake") {
        return format!(
            "The SMTP server's TLS certificate is not trusted. Tick “Trust this server's certificate” in Settings and try again. ({raw})"
        );
    }
    if lower.contains("timed out") || lower.contains("connection") || lower.contains("connect") {
        return format!("Could not reach the SMTP host. Check the server and port. ({raw})");
    }
    format!("SMTP send failed ({raw})")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_msgid_adds_brackets() {
        assert_eq!(wrap_msgid("abc@host"), "<abc@host>");
        assert_eq!(wrap_msgid("<abc@host>"), "<abc@host>");
    }

    #[test]
    fn cc_list_can_be_empty() {
        assert!(parse_address_list("", "Cc").unwrap().is_empty());
    }
}
