use serde::{Deserialize, Serialize};

mod autoconfig;
mod calendar;
mod classify;
mod folders;
mod text;

pub use autoconfig::{guess_servers, oauth_provider, ServerGuess};
pub use calendar::{is_calendar, parse_ics, parse_ics_bytes, MeetingInvite};
pub use classify::{classify_feed, classify_mail, keep_local_action, with_calendar, Classification};
pub use folders::{classify_imap_folder, ClassifiedFolder};
pub use text::{html_to_plain, preview_text};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub address: String,
    pub label: String,
    #[serde(default = "imap_kind")]
    pub kind: String,
    #[serde(default)]
    pub imap_host: Option<String>,
    #[serde(default)]
    pub imap_port: Option<u16>,
    #[serde(default)]
    pub imap_user: Option<String>,
    #[serde(default)]
    pub smtp_host: Option<String>,
    #[serde(default)]
    pub smtp_port: Option<u16>,
    #[serde(default)]
    pub smtp_user: Option<String>,
    #[serde(default)]
    pub trust_tls: bool,
    #[serde(default = "password_auth")]
    pub auth: String,
}

fn imap_kind() -> String {
    "imap".into()
}

fn password_auth() -> String {
    "password".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hero {
    pub label: String,
    pub tone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub account_id: String,
    pub feed: String,
    pub from_name: String,
    pub from_email: String,
    pub subject: String,
    pub preview: String,
    pub body: String,
    #[serde(default)]
    pub html_body: Option<String>,
    pub received_at: String,
    pub unread: bool,
    pub waiting_on: bool,
    #[serde(default)]
    pub flagged: bool,
    pub folder: String,
    pub hero: Option<Hero>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub why: Option<String>,
    #[serde(default)]
    pub to_email: String,
    #[serde(default)]
    pub cc_email: String,
    #[serde(default)]
    pub rfc_id: Option<String>,
    #[serde(default)]
    pub in_reply_to: Option<String>,
    #[serde(default)]
    pub invite: Option<MeetingInvite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub filename: String,
    pub content_type: String,
    pub size: u64,
    #[serde(default)]
    pub content_id: Option<String>,
    #[serde(default)]
    pub inline: bool,
    #[serde(default = "stored_true")]
    pub stored: bool,
}

fn stored_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailFolder {
    pub account_id: String,
    pub canonical: String,
    pub imap_name: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mailbox {
    pub accounts: Vec<Account>,
    pub messages: Vec<Message>,
    #[serde(default)]
    pub folders: Vec<MailFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDraft {
    pub address: String,
    pub password: String,
    pub label: String,
    pub kind: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_user: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    #[serde(default)]
    pub trust_tls: bool,
    #[serde(default)]
    pub auth: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendDraft {
    pub account_id: String,
    pub to: String,
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub confirm: bool,
    #[serde(default)]
    pub html: Option<String>,
    #[serde(default)]
    pub attachments: Vec<DraftAttachment>,
    #[serde(default)]
    pub cc: String,
    #[serde(default)]
    pub bcc: String,
    #[serde(default)]
    pub in_reply_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagChange {
    pub account_id: String,
    pub message_id: String,
    pub seen: Option<bool>,
    pub flagged: Option<bool>,
}

pub fn waiting_count(mailbox: &Mailbox, account_id: Option<&str>) -> usize {
    mailbox
        .messages
        .iter()
        .filter(|m| m.feed == "action" && m.folder == "inbox")
        .filter(|m| account_id.map(|id| m.account_id == id).unwrap_or(true))
        .filter(|m| m.unread || m.waiting_on)
        .count()
}

/// Split `{account}:{folder}:{uid}` where `folder` may contain colons (`custom:Work`).
pub fn parse_message_ref(account_id: &str, message_id: &str) -> Result<(String, u32), String> {
    if message_id.starts_with("sent:") {
        return Err(
            "This Sent copy is local-only. Sync the mailbox to change flags on the server.".into(),
        );
    }
    let prefix = format!("{account_id}:");
    let rest = message_id
        .strip_prefix(&prefix)
        .ok_or_else(|| "That letter does not belong to this mailbox.".to_string())?;
    let (folder, uid) = rest
        .rsplit_once(':')
        .ok_or_else(|| "Malformed message id.".to_string())?;
    if folder.is_empty() {
        return Err("Malformed message id.".into());
    }
    let uid: u32 = uid
        .parse()
        .map_err(|_| "Malformed message UID.".to_string())?;
    Ok((folder.to_string(), uid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_ref_inbox_and_custom() {
        let (folder, uid) = parse_message_ref("acc", "acc:inbox:12").unwrap();
        assert_eq!(folder, "inbox");
        assert_eq!(uid, 12);
        let (folder, uid) = parse_message_ref("acc", "acc:custom:Work/Invoices:42").unwrap();
        assert_eq!(folder, "custom:Work/Invoices");
        assert_eq!(uid, 42);
    }

    #[test]
    fn message_ref_rejects_local_sent() {
        assert!(parse_message_ref("acc", "sent:acc:deadbeef").is_err());
    }
}
