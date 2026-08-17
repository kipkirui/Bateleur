use serde::{Deserialize, Serialize};

mod autoconfig;
mod classify;
mod text;

pub use autoconfig::{guess_servers, ServerGuess};
pub use classify::classify_feed;
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
}

fn imap_kind() -> String {
    "imap".into()
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
    pub folder: String,
    pub hero: Option<Hero>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mailbox {
    pub accounts: Vec<Account>,
    pub messages: Vec<Message>,
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
