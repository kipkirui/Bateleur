use crate::imap::{compact_secret, is_gmail, looks_like_google_app_password};
use crate::parse::{self, FetchResult};
use bateleur_core::{Account, MailFolder};
use rustls::pki_types::ServerName;
use rustls::{ClientConnection, StreamOwned};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Duration;

const FETCH_LIMIT: usize = 40;
const MAX_MESSAGE_BYTES: usize = 15 * 1024 * 1024;

pub fn fetch_account(
    account: &Account,
    password: &str,
    known_uidls: &HashSet<String>,
) -> Result<FetchResult, String> {
    let mut session = login(account, password)?;
    let listing = match session.uidl() {
        Ok(rows) => rows,
        Err(_) => session
            .list()
            .map(|rows| {
                rows.into_iter()
                    .map(|(n, _size)| (n, n.to_string()))
                    .collect()
            })
            .map_err(|e| {
                session.quit();
                e
            })?,
    };
    let mut newest = listing;
    newest.sort_by_key(|(n, _)| *n);
    if newest.len() > FETCH_LIMIT {
        newest = newest.split_off(newest.len() - FETCH_LIMIT);
    }

    let mut messages = Vec::new();
    let mut parts = Vec::new();
    let mut pop_uidls = Vec::new();
    for (number, uidl) in newest {
        if known_uidls.contains(&uidl) {
            continue;
        }
        match session.retr(number) {
            Ok(raw) => {
                let id = format!("{}:inbox:{}", account.id, safe_uidl(&uidl));
                if let Some((message, extracted)) =
                    parse::from_rfc822(&account.id, "inbox", &id, &raw, true, false)
                {
                    parts.extend(extracted);
                    messages.push(message);
                    pop_uidls.push((uidl, id));
                }
            }
            Err(err) => {
                session.quit();
                return Err(err);
            }
        }
    }
    session.quit();
    Ok(FetchResult {
        messages,
        folders: vec![MailFolder {
            account_id: account.id.clone(),
            canonical: "inbox".into(),
            imap_name: "INBOX".into(),
            label: "Inbox".into(),
        }],
        parts,
        pop_uidls,
    })
}

fn login(account: &Account, password: &str) -> Result<PopSession, String> {
    let host = account
        .imap_host
        .as_deref()
        .ok_or("POP host is missing.")?;
    let port = account.imap_port.unwrap_or(995);
    let user = account
        .imap_user
        .as_deref()
        .filter(|u| !u.is_empty())
        .unwrap_or(account.address.as_str());
    let password = compact_secret(password);

    if is_gmail(account) && !looks_like_google_app_password(&password) {
        return Err(
            "Gmail POP will not accept your Google account password, even if it is correct. \
             Turn on 2-Step Verification, then create a 16-letter App password at \
             myaccount.google.com/apppasswords. Also enable POP in Gmail Settings → \
             Forwarding and POP/IMAP."
                .into(),
        );
    }

    let mut session = connect_tls(host, port, account.trust_tls)?;
    session.expect_ok("greeting")?;
    session
        .command(&format!("USER {user}"))
        .map_err(friendly)?;
    session
        .command(&format!("PASS {password}"))
        .map_err(|err| {
            if is_gmail(account) {
                format!(
                    "POP login was rejected. If this is Gmail, use a 16-letter App password, not your Google password. Server said: {err}"
                )
            } else {
                friendly(err)
            }
        })?;
    Ok(session)
}

fn connect_tls(host: &str, port: u16, trust_anyway: bool) -> Result<PopSession, String> {
    let config = crate::tls::client_config(trust_anyway)?;
    let name = ServerName::try_from(host.to_string())
        .map_err(|_| format!("Invalid POP host: {host}"))?;
    let conn = ClientConnection::new(Arc::new(config), name).map_err(|e| format!("TLS: {e}"))?;
    let tcp = TcpStream::connect((host, port))
        .map_err(|e| format!("Could not reach {host}:{port} ({e})"))?;
    tcp.set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| e.to_string())?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    Ok(PopSession {
        stream: StreamOwned::new(conn, tcp),
        leftover: Vec::new(),
    })
}

struct PopSession {
    stream: StreamOwned<ClientConnection, TcpStream>,
    leftover: Vec<u8>,
}

impl PopSession {
    fn command(&mut self, line: &str) -> Result<String, String> {
        self.write_line(line)?;
        self.expect_ok(line)
    }

    fn expect_ok(&mut self, context: &str) -> Result<String, String> {
        let line = self.read_line_text()?;
        if line.starts_with("+OK") {
            Ok(line)
        } else {
            Err(format!("POP {context}: {line}"))
        }
    }

    fn uidl(&mut self) -> Result<Vec<(u32, String)>, String> {
        self.command("UIDL")?;
        let mut rows = Vec::new();
        for line in self.read_multiline_text()? {
            let mut bits = line.split_whitespace();
            let Some(n) = bits.next().and_then(|s| s.parse().ok()) else {
                continue;
            };
            let uidl = bits.next().unwrap_or("").to_string();
            if uidl.is_empty() {
                continue;
            }
            rows.push((n, uidl));
        }
        Ok(rows)
    }

    fn list(&mut self) -> Result<Vec<(u32, u32)>, String> {
        self.command("LIST")?;
        let mut rows = Vec::new();
        for line in self.read_multiline_text()? {
            let mut bits = line.split_whitespace();
            let Some(n) = bits.next().and_then(|s| s.parse().ok()) else {
                continue;
            };
            let size = bits.next().and_then(|s| s.parse().ok()).unwrap_or(0);
            rows.push((n, size));
        }
        Ok(rows)
    }

    fn retr(&mut self, number: u32) -> Result<Vec<u8>, String> {
        self.command(&format!("RETR {number}"))?;
        self.read_multiline_bytes()
    }

    fn quit(&mut self) {
        let _ = self.write_line("QUIT");
        let _ = self.read_line_bytes();
    }

    fn write_line(&mut self, line: &str) -> Result<(), String> {
        self.stream
            .write_all(line.as_bytes())
            .and_then(|_| self.stream.write_all(b"\r\n"))
            .and_then(|_| self.stream.flush())
            .map_err(|e| format!("POP write failed ({e})"))
    }

    fn read_multiline_text(&mut self) -> Result<Vec<String>, String> {
        let raw = self.read_multiline_bytes()?;
        Ok(String::from_utf8_lossy(&raw)
            .lines()
            .map(|l| l.trim_end_matches('\r').to_string())
            .filter(|l| !l.is_empty())
            .collect())
    }

    fn read_multiline_bytes(&mut self) -> Result<Vec<u8>, String> {
        let mut out = Vec::new();
        loop {
            let line = self.read_line_bytes()?;
            if line == b"." {
                break;
            }
            let data = if let Some(rest) = line.strip_prefix(b".") {
                rest
            } else {
                &line
            };
            if out.len() + data.len() + 2 > MAX_MESSAGE_BYTES {
                return Err("That letter is larger than Bateleur will cache from POP.".into());
            }
            out.extend_from_slice(data);
            out.extend_from_slice(b"\r\n");
        }
        Ok(out)
    }

    fn read_line_text(&mut self) -> Result<String, String> {
        let line = self.read_line_bytes()?;
        Ok(String::from_utf8_lossy(&line).into_owned())
    }

    fn read_line_bytes(&mut self) -> Result<Vec<u8>, String> {
        loop {
            if let Some(pos) = find_crlf(&self.leftover) {
                let line = self.leftover[..pos].to_vec();
                self.leftover.drain(..pos + 2);
                return Ok(line);
            }
            let mut buf = [0u8; 8192];
            let n = self
                .stream
                .read(&mut buf)
                .map_err(|e| format!("POP read failed ({e})"))?;
            if n == 0 {
                return Err("POP connection closed.".into());
            }
            self.leftover.extend_from_slice(&buf[..n]);
            if self.leftover.len() > MAX_MESSAGE_BYTES {
                return Err("POP response was too large.".into());
            }
        }
    }
}

fn find_crlf(buf: &[u8]) -> Option<usize> {
    buf.windows(2).position(|w| w == b"\r\n")
}

pub(crate) fn safe_uidl(uidl: &str) -> String {
    let cleaned: String = uidl
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "uid".into()
    } else {
        cleaned
    }
}

fn friendly(err: String) -> String {
    let lower = err.to_lowercase();
    if lower.contains("unknownissuer")
        || lower.contains("certificate")
        || lower.contains("cert")
        || lower.contains("trust")
        || lower.contains("tls")
    {
        return format!(
            "The mail server's TLS certificate is not trusted (often a missing CA chain). Tick “Trust this server's certificate” in Settings and try again. ({err})"
        );
    }
    if lower.contains("authentication")
        || lower.contains("-err")
        || lower.contains("pass")
        || lower.contains("login")
        || lower.contains("user")
    {
        return format!("POP login was rejected. Check the host, username, and password. Server said: {err}");
    }
    if lower.contains("timed out") || lower.contains("connection") {
        return format!("Could not reach the POP host. Check the server and port. ({err})");
    }
    err
}

#[cfg(test)]
mod tests {
    use super::safe_uidl;

    #[test]
    fn uidl_strips_colons() {
        assert_eq!(safe_uidl("ab:cd/ef"), "ab_cd_ef");
        assert_eq!(safe_uidl("GmailId123"), "GmailId123");
    }
}
