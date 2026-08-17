use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerGuess {
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
}

pub fn guess_servers(address: &str) -> Option<ServerGuess> {
    let address = address.trim().to_lowercase();
    let (local, domain) = address.split_once('@')?;
    if local.is_empty() || !domain.contains('.') {
        return None;
    }

    let (imap_host, smtp_host) = match domain {
        "gmail.com" | "googlemail.com" => ("imap.gmail.com", "smtp.gmail.com"),
        "outlook.com" | "hotmail.com" | "live.com" | "msn.com" | "office365.com" => {
            ("outlook.office365.com", "smtp.office365.com")
        }
        "fastmail.com" | "fastmail.fm" => ("imap.fastmail.com", "smtp.fastmail.com"),
        "yahoo.com" | "ymail.com" => ("imap.mail.yahoo.com", "smtp.mail.yahoo.com"),
        "icloud.com" | "me.com" | "mac.com" => ("imap.mail.me.com", "smtp.mail.me.com"),
        other => {
            return Some(ServerGuess {
                imap_host: format!("imap.{other}"),
                imap_port: 993,
                smtp_host: format!("smtp.{other}"),
                smtp_port: 587,
                username: address,
            });
        }
    };

    Some(ServerGuess {
        imap_host: imap_host.into(),
        imap_port: 993,
        smtp_host: smtp_host.into(),
        smtp_port: 587,
        username: address,
    })
}
