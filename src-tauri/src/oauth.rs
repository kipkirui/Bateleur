use crate::secrets;
use bateleur_core::Account;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::Path;
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CLIENTS_FILE: &str = "oauth-clients.json";
const WAIT: Duration = Duration::from_secs(3 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStatus {
    pub google: bool,
    pub microsoft: bool,
    pub google_client_id: String,
    pub microsoft_client_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ClientFile {
    #[serde(default)]
    google: String,
    #[serde(default)]
    microsoft: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBlob {
    pub v: u8,
    pub kind: String,
    pub provider: String,
    #[serde(default)]
    pub client_id: String,
    pub refresh: String,
    pub access: String,
    pub expires_at: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    expires_in: u64,
}

pub struct Xoauth2 {
    pub user: String,
    pub access_token: String,
}

impl imap::Authenticator for Xoauth2 {
    type Response = String;
    fn process(&self, _: &[u8]) -> Self::Response {
        sasl_xoauth2(&self.user, &self.access_token)
    }
}

pub fn sasl_xoauth2(user: &str, token: &str) -> String {
    format!("user={user}\x01auth=Bearer {token}\x01\x01")
}

pub fn sasl_xoauth2_b64(user: &str, token: &str) -> String {
    base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        sasl_xoauth2(user, token),
    )
}

pub fn uses_xoauth2(account: &Account) -> bool {
    account.auth == "xoauth2"
}

pub fn status(app_data: &Path) -> OAuthStatus {
    let stored = load_clients(app_data);
    OAuthStatus {
        google: !stored.google.is_empty(),
        microsoft: !stored.microsoft.is_empty(),
        google_client_id: stored.google,
        microsoft_client_id: stored.microsoft,
    }
}

pub fn save_clients(app_data: &Path, google: String, microsoft: String) -> Result<(), String> {
    std::fs::create_dir_all(app_data).map_err(|e| e.to_string())?;
    let file = ClientFile {
        google: google.trim().to_string(),
        microsoft: microsoft.trim().to_string(),
    };
    std::fs::write(
        app_data.join(CLIENTS_FILE),
        serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

pub fn prepare_secret(account: &Account) -> Result<String, String> {
    let raw = secrets::load_password(&account.address)?;
    if let Ok(blob) = serde_json::from_str::<TokenBlob>(&raw) {
        if blob.kind == "xoauth2" {
            let fresh = refresh_if_needed(blob)?;
            store_tokens(&account.address, &fresh)?;
            return Ok(fresh.access);
        }
    }
    Ok(crate::imap::compact_secret(&raw))
}

pub fn store_tokens(address: &str, blob: &TokenBlob) -> Result<(), String> {
    secrets::save_password(address, &persist_blob(blob)?)
}

pub fn sign_in(
    app_data: &Path,
    provider: &str,
    login_hint: &str,
    open_url: impl FnOnce(&str) -> Result<(), String>,
) -> Result<TokenBlob, String> {
    let provider = provider.trim().to_lowercase();
    let clients = load_clients(app_data);
    let client_id = match provider.as_str() {
        "google" => clients.google,
        "microsoft" => clients.microsoft,
        _ => return Err("Choose Google or Microsoft.".into()),
    };
    if client_id.is_empty() {
        return Err(missing_client_help(&provider));
    }

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = loopback_redirect(&provider, port);
    let verifier = random_token();
    let challenge = pkce_challenge(&verifier);
    let state = random_token();
    let url = authorize_url(
        &provider,
        &client_id,
        &redirect,
        &challenge,
        &state,
        login_hint,
    )?;
    let (tx, rx) = mpsc::channel();
    let expected = state.clone();
    std::thread::spawn(move || {
        let _ = tx.send(collect_code(listener, &expected));
    });
    open_url(&url)?;
    let code = rx
        .recv_timeout(WAIT)
        .map_err(|_| "Sign-in timed out. Try again from Settings.".to_string())??;
    exchange_code(&provider, &client_id, &redirect, &code, &verifier)
}

fn load_clients(app_data: &Path) -> ClientFile {
    let mut file = ClientFile {
        google: env_or_compile("BATELEUR_GOOGLE_OAUTH_CLIENT_ID", option_env!("BATELEUR_GOOGLE_OAUTH_CLIENT_ID")),
        microsoft: env_or_compile(
            "BATELEUR_MICROSOFT_OAUTH_CLIENT_ID",
            option_env!("BATELEUR_MICROSOFT_OAUTH_CLIENT_ID"),
        ),
    };
    if let Ok(raw) = std::fs::read_to_string(app_data.join(CLIENTS_FILE)) {
        if let Ok(stored) = serde_json::from_str::<ClientFile>(&raw) {
            if file.google.is_empty() {
                file.google = stored.google;
            }
            if file.microsoft.is_empty() {
                file.microsoft = stored.microsoft;
            }
        }
    }
    file
}

fn env_or_compile(runtime: &str, compiled: Option<&str>) -> String {
    if let Ok(value) = std::env::var(runtime) {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    compiled.unwrap_or("").trim().to_string()
}

fn missing_client_help(provider: &str) -> String {
    match provider {
        "google" => {
            "Sign in with Google needs a Desktop OAuth client ID. In Google Cloud Console: APIs & Services → Credentials → Create credentials → OAuth client ID → Desktop app. Paste it under OAuth client IDs in Settings, or set BATELEUR_GOOGLE_OAUTH_CLIENT_ID. Enable the Gmail API for that project (Bateleur still uses IMAP, not the Gmail API)."
                .into()
        }
        _ => {
            "Sign in with Microsoft needs a public-client application ID. In Azure: App registrations → New registration. Authentication → Add a platform → Mobile and desktop applications. Add the redirect URI http://localhost (not Web, not SPA, not nativeclient-only). Allow public client flows: Yes. Paste the Application (client) ID under OAuth client IDs in Settings, or set BATELEUR_MICROSOFT_OAUTH_CLIENT_ID."
                .into()
        }
    }
}

fn loopback_redirect(provider: &str, port: u16) -> String {
    match provider {
        // Entra ignores the port on localhost. A trailing slash is a different
        // path than the URI Azure stores for "http://localhost".
        "microsoft" => format!("http://localhost:{port}"),
        _ => format!("http://127.0.0.1:{port}/"),
    }
}

fn authorize_url(
    provider: &str,
    client_id: &str,
    redirect: &str,
    challenge: &str,
    state: &str,
    login_hint: &str,
) -> Result<String, String> {
    let (auth, scope, extra) = match provider {
        "google" => (
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://mail.google.com/",
            "&access_type=offline&prompt=consent",
        ),
        "microsoft" => (
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/POP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
            "",
        ),
        _ => return Err("Unknown OAuth provider.".into()),
    };
    Ok(format!(
        "{auth}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256&login_hint={}{extra}",
        enc(client_id),
        enc(redirect),
        enc(scope),
        enc(state),
        enc(challenge),
        enc(login_hint),
    ))
}

fn token_url(provider: &str) -> &'static str {
    match provider {
        "microsoft" => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        _ => "https://oauth2.googleapis.com/token",
    }
}

fn exchange_code(
    provider: &str,
    client_id: &str,
    redirect: &str,
    code: &str,
    verifier: &str,
) -> Result<TokenBlob, String> {
    let form = [
        ("client_id", client_id),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect),
        ("code_verifier", verifier),
    ];
    let parsed = post_token(token_url(provider), &form)?;
    if parsed.refresh_token.is_empty() {
        return Err("The provider did not return a refresh token. Sign in again and accept every permission.".into());
    }
    Ok(TokenBlob {
        v: 1,
        kind: "xoauth2".into(),
        provider: provider.into(),
        client_id: client_id.into(),
        refresh: parsed.refresh_token,
        access: parsed.access_token,
        expires_at: now_secs().saturating_add(parsed.expires_in.max(60)),
    })
}

fn persist_blob(blob: &TokenBlob) -> Result<String, String> {
    let slim = TokenBlob {
        v: blob.v,
        kind: blob.kind.clone(),
        provider: blob.provider.clone(),
        client_id: blob.client_id.clone(),
        refresh: blob.refresh.clone(),
        access: String::new(),
        expires_at: 0,
    };
    serde_json::to_string(&slim).map_err(|e| e.to_string())
}

fn refresh_if_needed(mut blob: TokenBlob) -> Result<TokenBlob, String> {
    let now = now_secs();
    if blob.expires_at > now.saturating_add(120) && !blob.access.is_empty() {
        return Ok(blob);
    }
    let form = [
        ("client_id", blob.client_id.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", blob.refresh.as_str()),
    ];
    let parsed = post_token(token_url(&blob.provider), &form)?;
    blob.access = parsed.access_token;
    if !parsed.refresh_token.is_empty() {
        blob.refresh = parsed.refresh_token;
    }
    blob.expires_at = now.saturating_add(parsed.expires_in.max(60));
    Ok(blob)
}

fn post_token(url: &str, form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let mut tls = crate::tls::client_config(false)?;
    tls.alpn_protocols = vec![b"http/1.1".to_vec()];
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(45))
        .tls_config(Arc::new(tls))
        .build();
    match agent.post(url).send_form(form) {
        Ok(resp) => resp.into_json().map_err(|e| format!("OAuth token JSON ({e})")),
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            Err(format!(
                "OAuth token request failed ({code}). {body}"
            ))
        }
        Err(err) => Err(format!("Could not reach the OAuth token host ({err})")),
    }
}

fn collect_code(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    let deadline = Instant::now() + WAIT;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err("Sign-in timed out. Try again from Settings.".into());
        }
        let _ = listener.set_nonblocking(false);
        match listener.accept() {
            Ok((stream, _)) => match take_redirect(stream, expected_state) {
                Ok(None) => continue,
                Ok(Some(code)) => return Ok(code),
                Err(err) => return Err(err),
            },
            Err(err) => {
                if Instant::now() >= deadline {
                    return Err("Sign-in timed out. Try again from Settings.".into());
                }
                return Err(format!("OAuth redirect ({err})"));
            }
        }
    }
}

fn take_redirect(mut stream: TcpStream, expected_state: &str) -> Result<Option<String>, String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let req = read_http_head(&mut stream)?;
    let line = req.lines().next().unwrap_or("");
    let path = line.split_whitespace().nth(1).unwrap_or("/");
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let params = parse_query(query);
    if params.get("error").is_none() && params.get("code").is_none() {
        let _ = write_page(&mut stream, "Bateleur is waiting for sign-in. You can close this window.");
        let _ = stream.shutdown(Shutdown::Both);
        return Ok(None);
    }
    let page = if params.get("error").is_some() {
        "Bateleur could not sign in. You can close this window."
    } else {
        "Bateleur is signed in. You can close this window."
    };
    let _ = write_page(&mut stream, page);
    let _ = stream.shutdown(Shutdown::Both);
    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return Err(format!("Sign-in was refused ({err}). {desc}"));
    }
    let state = params.get("state").cloned().unwrap_or_default();
    if state != expected_state {
        return Err("OAuth state did not match. Try sign-in again.".into());
    }
    params
        .get("code")
        .cloned()
        .filter(|c| !c.is_empty())
        .ok_or_else(|| "The provider did not return an authorization code.".into())
        .map(Some)
}

fn read_http_head(stream: &mut TcpStream) -> Result<String, String> {
    let mut data = Vec::new();
    let mut buf = [0u8; 2048];
    loop {
        let n = match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(err) if err.kind() == std::io::ErrorKind::TimedOut => break,
            Err(err) => return Err(err.to_string()),
        };
        data.extend_from_slice(&buf[..n]);
        if data.windows(4).any(|w| w == b"\r\n\r\n") || data.len() > 64 * 1024 {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&data).into_owned())
}

fn write_page(stream: &mut TcpStream, page: &str) -> std::io::Result<()> {
    let body = format!(
        "<!doctype html><html><body style=\"font-family:Segoe UI,sans-serif;padding:2rem;background:#FDFBF7;color:#1c1917\"><p>{page}</p></body></html>"
    );
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    for part in query.split('&') {
        if part.is_empty() {
            continue;
        }
        let (k, v) = part.split_once('=').unwrap_or((part, ""));
        out.insert(dec(k), dec(v));
    }
    out
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, digest)
}

fn random_token() -> String {
    let mut raw = Vec::with_capacity(32);
    raw.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    raw.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, raw)
}

fn enc(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn dec(value: &str) -> String {
    let mut bytes = Vec::new();
    let chars: Vec<char> = value.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' && i + 2 < chars.len() {
            let hex: String = chars[i + 1..i + 3].iter().collect();
            if let Ok(b) = u8::from_str_radix(&hex, 16) {
                bytes.push(b);
                i += 3;
                continue;
            }
        }
        if chars[i] == '+' {
            bytes.push(b' ');
        } else {
            let c = chars[i];
            bytes.extend_from_slice(c.encode_utf8(&mut [0; 4]).as_bytes());
        }
        i += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc7636_pkce_s256() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn xoauth2_sasl_shape() {
        let raw = sasl_xoauth2("ed@gmail.com", "tok");
        assert_eq!(raw, "user=ed@gmail.com\x01auth=Bearer tok\x01\x01");
        assert!(!sasl_xoauth2_b64("ed@gmail.com", "tok").contains('\n'));
    }

    #[test]
    fn query_round_trips_code() {
        let map = parse_query("code=abc%2Fde&state=s1");
        assert_eq!(map.get("code").unwrap(), "abc/de");
        assert_eq!(map.get("state").unwrap(), "s1");
    }

    #[test]
    fn microsoft_loopback_matches_azure_localhost() {
        assert_eq!(loopback_redirect("microsoft", 54321), "http://localhost:54321");
        assert_eq!(loopback_redirect("google", 9), "http://127.0.0.1:9/");
    }

    #[test]
    fn persist_blob_drops_access_token() {
        let blob = TokenBlob {
            v: 1,
            kind: "xoauth2".into(),
            provider: "microsoft".into(),
            client_id: "id".into(),
            refresh: "refresh-token".into(),
            access: "very-long-access-jwt".into(),
            expires_at: 99,
        };
        let raw = persist_blob(&blob).unwrap();
        assert!(!raw.contains("very-long-access-jwt"));
        let loaded: TokenBlob = serde_json::from_str(&raw).unwrap();
        assert_eq!(loaded.refresh, "refresh-token");
        assert!(loaded.access.is_empty());
        assert_eq!(loaded.expires_at, 0);
    }
}
