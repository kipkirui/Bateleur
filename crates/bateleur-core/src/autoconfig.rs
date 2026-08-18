use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerGuess {
    pub imap_host: String,
    pub imap_port: u16,
    pub pop_host: String,
    pub pop_port: u16,
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

    let (imap_host, pop_host, smtp_host) = match domain {
        "gmail.com" | "googlemail.com" => ("imap.gmail.com", "pop.gmail.com", "smtp.gmail.com"),
        "outlook.com" | "hotmail.com" | "live.com" | "msn.com" | "office365.com" => {
            (
                "outlook.office365.com",
                "outlook.office365.com",
                "smtp.office365.com",
            )
        }
        "fastmail.com" | "fastmail.fm" => {
            ("imap.fastmail.com", "pop.fastmail.com", "smtp.fastmail.com")
        }
        "yahoo.com" | "ymail.com" => (
            "imap.mail.yahoo.com",
            "pop.mail.yahoo.com",
            "smtp.mail.yahoo.com",
        ),
        "icloud.com" | "me.com" | "mac.com" => {
            ("imap.mail.me.com", "pop.mail.me.com", "smtp.mail.me.com")
        }
        other => {
            return Some(ServerGuess {
                imap_host: format!("imap.{other}"),
                imap_port: 993,
                pop_host: format!("pop.{other}"),
                pop_port: 995,
                smtp_host: format!("smtp.{other}"),
                smtp_port: 587,
                username: address,
            });
        }
    };

    Some(ServerGuess {
        imap_host: imap_host.into(),
        imap_port: 993,
        pop_host: pop_host.into(),
        pop_port: 995,
        smtp_host: smtp_host.into(),
        smtp_port: 587,
        username: address,
    })
}

pub fn oauth_provider(address: &str) -> Option<&'static str> {
    let address = address.trim().to_lowercase();
    let domain = address.split_once('@')?.1;
    match domain {
        "gmail.com" | "googlemail.com" => Some("google"),
        "outlook.com" | "hotmail.com" | "live.com" | "msn.com" | "office365.com" => {
            Some("microsoft")
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gmail_has_pop_and_imap() {
        let guess = guess_servers("ed@gmail.com").unwrap();
        assert_eq!(guess.imap_host, "imap.gmail.com");
        assert_eq!(guess.pop_host, "pop.gmail.com");
        assert_eq!(guess.pop_port, 995);
        assert_eq!(guess.smtp_host, "smtp.gmail.com");
    }

    #[test]
    fn oauth_provider_from_domain() {
        assert_eq!(oauth_provider("ed@gmail.com"), Some("google"));
        assert_eq!(oauth_provider("ed@outlook.com"), Some("microsoft"));
        assert_eq!(oauth_provider("ed@fastmail.com"), None);
    }

    #[test]
    fn generic_domain_guesses_pop() {
        let guess = guess_servers("mail@example.edu").unwrap();
        assert_eq!(guess.imap_host, "imap.example.edu");
        assert_eq!(guess.pop_host, "pop.example.edu");
        assert_eq!(guess.pop_port, 995);
    }
}
