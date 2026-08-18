use crate::db;
use crate::secrets;
use bateleur_core::Message;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const BODY_LIMIT: usize = 8000;
const TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffHire {
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub summarize: bool,
    #[serde(default)]
    pub drafts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffStatus {
    pub hired: bool,
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub summarize: bool,
    pub drafts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffSummary {
    pub blurb: String,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffDraft {
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffLetter {
    pub summary: Option<StaffSummary>,
    pub draft: Option<String>,
}

#[derive(Clone)]
pub struct Runtime {
    provider: String,
    model: String,
    endpoint: String,
    key: String,
}

pub fn status(conn: &Connection) -> Result<StaffStatus, String> {
    Ok(StaffStatus {
        hired: secrets::staff_key_present(),
        provider: parse_provider(&db::pref_string(conn, "staff_provider", "openai")?)
            .unwrap_or("openai")
            .to_string(),
        model: db::pref_string(conn, "staff_model", "")?,
        endpoint: db::pref_string(conn, "staff_endpoint", "")?,
        summarize: db::pref_bool_or(conn, "staff_summarize", false)?,
        drafts: db::pref_bool_or(conn, "staff_drafts", false)?,
    })
}

pub fn save(conn: &Connection, hire: StaffHire) -> Result<StaffStatus, String> {
    let provider = parse_provider(&hire.provider)?.to_string();
    let model = hire.model.trim().to_string();
    let endpoint = hire.endpoint.trim().to_string();
    if provider == "compatible" {
        chat_completions_url(&endpoint)?;
    }
    let key: String = hire.key.chars().filter(|c| !c.is_whitespace()).collect();
    if key.is_empty() {
        if !secrets::staff_key_present() {
            return Err("Paste a key to hire staff.".into());
        }
    } else {
        secrets::save_staff_key(&key)?;
    }
    db::set_pref(conn, "staff_provider", &provider)?;
    db::set_pref(conn, "staff_model", &model)?;
    db::set_pref(conn, "staff_endpoint", &endpoint)?;
    db::set_pref(
        conn,
        "staff_summarize",
        if hire.summarize { "1" } else { "0" },
    )?;
    db::set_pref(conn, "staff_drafts", if hire.drafts { "1" } else { "0" })?;
    status(conn)
}

pub fn clear(conn: &Connection) -> Result<StaffStatus, String> {
    secrets::delete_staff_key()?;
    db::set_pref(conn, "staff_summarize", "0")?;
    db::set_pref(conn, "staff_drafts", "0")?;
    status(conn)
}

pub fn letter_notes(conn: &Connection, message_id: &str) -> Result<StaffLetter, String> {
    let summary = match db::staff_note(conn, message_id, "summary")? {
        Some((body, extra, _)) => Some(StaffSummary {
            blurb: body,
            keywords: parse_keywords(&extra),
        }),
        None => None,
    };
    let draft = db::staff_note(conn, message_id, "draft")?.map(|(body, _, _)| body);
    Ok(StaffLetter { summary, draft })
}

pub fn prepare_summarize(
    conn: &Connection,
    message_id: &str,
) -> Result<(Runtime, Message), String> {
    prepare(conn, message_id, "staff_summarize", "Turn on Summarize this message in Hire staff.")
}

pub fn prepare_draft(conn: &Connection, message_id: &str) -> Result<(Runtime, Message), String> {
    prepare(
        conn,
        message_id,
        "staff_drafts",
        "Turn on Generate drafts in Hire staff.",
    )
}

pub fn summarize(runtime: &Runtime, message: &Message) -> Result<StaffSummary, String> {
    let text = complete(
        runtime,
        "You are the summarizer on a local mail desk. Reply with JSON only: {\"blurb\":\"one or two sentences\",\"keywords\":[\"short\",\"tags\"]}. No greeting. No markdown.",
        &letter_prompt(message),
    )?;
    Ok(parse_summary(&text))
}

pub fn store_summary(
    conn: &Connection,
    message_id: &str,
    summary: &StaffSummary,
) -> Result<(), String> {
    let extra = serde_json::to_string(&summary.keywords).unwrap_or_else(|_| "[]".into());
    db::set_staff_note(conn, message_id, "summary", &summary.blurb, &extra)
}

pub fn draft(runtime: &Runtime, message: &Message) -> Result<StaffDraft, String> {
    let text = complete(
        runtime,
        "You draft a reply on a local mail desk. Never send. Plain text only. No subject line. Do not introduce the draft. Concise, in the user's voice.",
        &format!("{}\n\nWrite a reply.", letter_prompt(message)),
    )?;
    Ok(StaffDraft {
        body: text.trim().to_string(),
    })
}

pub fn store_draft(conn: &Connection, message_id: &str, draft: &StaffDraft) -> Result<(), String> {
    db::set_staff_note(conn, message_id, "draft", &draft.body, "")
}

fn prepare(
    conn: &Connection,
    message_id: &str,
    pref: &str,
    off_message: &str,
) -> Result<(Runtime, Message), String> {
    if !db::pref_bool_or(conn, pref, false)? {
        return Err(off_message.into());
    }
    let provider = parse_provider(&db::pref_string(conn, "staff_provider", "openai")?)?.to_string();
    let model = db::pref_string(conn, "staff_model", "")?;
    let endpoint = db::pref_string(conn, "staff_endpoint", "")?;
    let key = secrets::load_staff_key()?;
    let message = db::get_message(conn, message_id)?;
    Ok((
        Runtime {
            provider,
            model,
            endpoint,
            key,
        },
        message,
    ))
}

fn letter_prompt(message: &Message) -> String {
    let from = if message.from_name.is_empty() {
        message.from_email.clone()
    } else {
        format!("{} <{}>", message.from_name, message.from_email)
    };
    let body = if message.body.trim().is_empty() {
        message.preview.as_str()
    } else {
        message.body.as_str()
    };
    format!(
        "From: {}\nSubject: {}\n---\n{}",
        from,
        message.subject,
        clip_text(body, BODY_LIMIT)
    )
}

fn complete(runtime: &Runtime, system: &str, user: &str) -> Result<String, String> {
    let provider = runtime.provider.as_str();
    let model = resolved_model(provider, &runtime.model)?;
    match provider {
        "anthropic" => anthropic_complete(&runtime.key, &model, system, user),
        "gemini" => gemini_complete(&runtime.key, &model, system, user),
        _ => openai_complete(provider, runtime, &model, system, user),
    }
}

fn openai_complete(
    provider: &str,
    runtime: &Runtime,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String, String> {
    let url = match provider {
        "openai" => "https://api.openai.com/v1/chat/completions".to_string(),
        "openrouter" => "https://openrouter.ai/api/v1/chat/completions".to_string(),
        "compatible" => chat_completions_url(&runtime.endpoint)?,
        _ => return Err("Unknown staff provider.".into()),
    };
    let mut req = agent()
        .post(&url)
        .set("Authorization", &format!("Bearer {}", runtime.key))
        .set("Content-Type", "application/json");
    if provider == "openrouter" {
        req = req
            .set("HTTP-Referer", "https://github.com/kipkirui/Bateleur")
            .set("X-Title", "Bateleur");
    }
    let value = send_json(
        req,
        json!({
            "model": model,
            "temperature": 0.2,
            "max_tokens": 512,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }),
    )?;
    value["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "The provider returned an empty reply.".into())
}

fn anthropic_complete(key: &str, model: &str, system: &str, user: &str) -> Result<String, String> {
    let value = send_json(
        agent()
            .post("https://api.anthropic.com/v1/messages")
            .set("x-api-key", key)
            .set("anthropic-version", "2023-06-01")
            .set("Content-Type", "application/json"),
        json!({
            "model": model,
            "max_tokens": 512,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }),
    )?;
    let parts = value["content"].as_array().ok_or("The provider returned an empty reply.")?;
    let mut text = String::new();
    for part in parts {
        if part["type"].as_str() == Some("text") {
            if let Some(chunk) = part["text"].as_str() {
                text.push_str(chunk);
            }
        }
    }
    if text.trim().is_empty() {
        Err("The provider returned an empty reply.".into())
    } else {
        Ok(text)
    }
}

fn gemini_complete(key: &str, model: &str, system: &str, user: &str) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    );
    let value = send_json(
        agent()
            .post(&url)
            .set("Content-Type", "application/json"),
        json!({
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 512}
        }),
    )?;
    value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "The provider returned an empty reply.".into())
}

fn send_json(req: ureq::Request, body: Value) -> Result<Value, String> {
    match req.send_json(body) {
        Ok(resp) => resp
            .into_json()
            .map_err(|_| "The provider returned a reply we could not read.".into()),
        Err(ureq::Error::Status(code, resp)) => {
            let _ = resp.into_string();
            Err(status_error(code))
        }
        Err(_) => Err("Could not reach the provider.".into()),
    }
}

fn status_error(code: u16) -> String {
    match code {
        401 | 403 => "The provider refused the key.".into(),
        429 => "The provider asked us to slow down.".into(),
        _ => format!("The provider returned {code}."),
    }
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(TIMEOUT).build()
}

fn parse_provider(raw: &str) -> Result<&'static str, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "openai" => Ok("openai"),
        "anthropic" => Ok("anthropic"),
        "gemini" => Ok("gemini"),
        "openrouter" => Ok("openrouter"),
        "compatible" => Ok("compatible"),
        _ => Err("Unknown staff provider.".into()),
    }
}

fn resolved_model(provider: &str, model: &str) -> Result<String, String> {
    let trimmed = model.trim();
    if !trimmed.is_empty() {
        return Ok(trimmed.to_string());
    }
    match provider {
        "openai" => Ok("gpt-4o-mini".into()),
        "anthropic" => Ok("claude-3-5-haiku-latest".into()),
        "gemini" => Ok("gemini-2.0-flash".into()),
        "openrouter" => Ok("openai/gpt-4o-mini".into()),
        "compatible" => Err("Choose a model for this endpoint.".into()),
        _ => Err("Unknown staff provider.".into()),
    }
}

fn chat_completions_url(endpoint: &str) -> Result<String, String> {
    let base = endpoint.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Compatible staff needs an endpoint URL.".into());
    }
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err("Endpoint must start with http:// or https://.".into());
    }
    if base.ends_with("/chat/completions") {
        Ok(base.to_string())
    } else {
        Ok(format!("{base}/chat/completions"))
    }
}

fn clip_text(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let clipped: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", clipped.trim_end())
}

fn parse_summary(raw: &str) -> StaffSummary {
    let cleaned = strip_fences(raw);
    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        let blurb = value["blurb"]
            .as_str()
            .or_else(|| value["summary"].as_str())
            .unwrap_or(cleaned)
            .trim()
            .to_string();
        let keywords = value["keywords"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .take(8)
                    .collect()
            })
            .unwrap_or_default();
        if !blurb.is_empty() {
            return StaffSummary { blurb, keywords };
        }
    }
    StaffSummary {
        blurb: cleaned.trim().to_string(),
        keywords: Vec::new(),
    }
}

fn parse_keywords(extra: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(extra).unwrap_or_default()
}

fn strip_fences(raw: &str) -> &str {
    let trimmed = raw.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    let rest = rest
        .strip_prefix("json")
        .or_else(|| rest.strip_prefix("JSON"))
        .unwrap_or(rest)
        .trim_start();
    rest.strip_suffix("```").unwrap_or(rest).trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clips_long_body() {
        let long = "word ".repeat(3000);
        let clipped = clip_text(&long, 40);
        assert!(clipped.ends_with('…'));
        assert!(clipped.chars().count() <= 40);
    }

    #[test]
    fn parses_fenced_summary() {
        let summary = parse_summary("```json\n{\"blurb\":\"Pay the invoice.\",\"keywords\":[\"invoice\",\"due\"]}\n```");
        assert_eq!(summary.blurb, "Pay the invoice.");
        assert_eq!(summary.keywords, vec!["invoice", "due"]);
    }

    #[test]
    fn summary_falls_back_to_plain_text() {
        let summary = parse_summary("Just a sentence.");
        assert_eq!(summary.blurb, "Just a sentence.");
        assert!(summary.keywords.is_empty());
    }

    #[test]
    fn compatible_url_appends_chat() {
        assert_eq!(
            chat_completions_url("https://localhost:11434/v1").unwrap(),
            "https://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://localhost:11434/v1/chat/completions/").unwrap(),
            "https://localhost:11434/v1/chat/completions"
        );
    }

    #[test]
    fn default_models() {
        assert_eq!(resolved_model("openai", "").unwrap(), "gpt-4o-mini");
        assert!(resolved_model("compatible", "").is_err());
        assert_eq!(resolved_model("gemini", "gemini-2.5-flash").unwrap(), "gemini-2.5-flash");
    }
}
