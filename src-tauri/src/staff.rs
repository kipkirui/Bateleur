use crate::db;
use crate::secrets;
use bateleur_core::{keep_local_action, Message};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
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
    pub summarize_account: bool,
    #[serde(default)]
    pub summarize_new: bool,
    #[serde(default)]
    pub drafts: bool,
    #[serde(default)]
    pub triage: bool,
    #[serde(default)]
    pub triage_new: bool,
    #[serde(default)]
    pub schedule: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffStatus {
    pub hired: bool,
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub summarize: bool,
    pub summarize_account: bool,
    pub summarize_new: bool,
    pub drafts: bool,
    pub triage: bool,
    pub triage_new: bool,
    pub schedule: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffBriefItem {
    pub id: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffBrief {
    pub blurb: String,
    pub items: Vec<StaffBriefItem>,
    pub at: String,
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
        summarize_account: db::pref_bool_or(conn, "staff_summarize_account", false)?,
        summarize_new: db::pref_bool_or(conn, "staff_summarize_new", false)?,
        drafts: db::pref_bool_or(conn, "staff_drafts", false)?,
        triage: db::pref_bool_or(conn, "staff_triage", false)?,
        triage_new: db::pref_bool_or(conn, "staff_triage_new", false)?,
        schedule: db::pref_bool_or(conn, "staff_schedule", false)?,
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
    db::set_pref(
        conn,
        "staff_summarize_account",
        if hire.summarize_account { "1" } else { "0" },
    )?;
    db::set_pref(
        conn,
        "staff_summarize_new",
        if hire.summarize_new { "1" } else { "0" },
    )?;
    db::set_pref(conn, "staff_drafts", if hire.drafts { "1" } else { "0" })?;
    db::set_pref(conn, "staff_triage", if hire.triage { "1" } else { "0" })?;
    db::set_pref(
        conn,
        "staff_triage_new",
        if hire.triage_new { "1" } else { "0" },
    )?;
    db::set_pref(conn, "staff_schedule", if hire.schedule { "1" } else { "0" })?;
    status(conn)
}

pub fn clear(conn: &Connection) -> Result<StaffStatus, String> {
    secrets::delete_staff_key()?;
    db::set_pref(conn, "staff_summarize", "0")?;
    db::set_pref(conn, "staff_summarize_account", "0")?;
    db::set_pref(conn, "staff_summarize_new", "0")?;
    db::set_pref(conn, "staff_drafts", "0")?;
    db::set_pref(conn, "staff_triage", "0")?;
    db::set_pref(conn, "staff_triage_new", "0")?;
    db::set_pref(conn, "staff_schedule", "0")?;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffTriage {
    pub feed: String,
    pub category: Option<String>,
    pub why: String,
}

pub fn prepare_triage(conn: &Connection, message_id: &str) -> Result<(Runtime, Message), String> {
    let (runtime, message) = prepare(
        conn,
        message_id,
        "staff_triage",
        "Turn on Triage this letter in Hire staff.",
    )?;
    if db::sender_locked_reading(conn, &message.from_email)? {
        return Err("This sender stays in Reading until you Guess again on their page.".into());
    }
    Ok((runtime, message))
}

pub fn decide_triage(runtime: &Runtime, message: &Message) -> Result<StaffTriage, String> {
    let text = complete(
        runtime,
        "You are the triage editor on a local mail desk. Decide front page (action: needs the editor now — invoices, codes, please-reply, deadlines) vs back page (reading: newsletters, FYI, long threads). Reply with JSON only: {\"feed\":\"action\" or \"reading\",\"category\":\"short badge or null\",\"reason\":\"one sentence the editor can see\"}. Known categories: 2FA, Invoice, Receipt, Wire, Please reply, RSVP, Sign-off, Password, KYC. Use null category for reading. No greeting. No markdown.",
        &letter_prompt(message),
    )?;
    Ok(parse_triage(&text))
}

pub fn store_triage(conn: &Connection, message_id: &str, triage: &StaffTriage) -> Result<(), String> {
    if db::sender_locked_reading(conn, &db::get_message(conn, message_id)?.from_email)? {
        return Err("This sender stays in Reading until you Guess again on their page.".into());
    }
    db::apply_triage(
        conn,
        message_id,
        &triage.feed,
        triage.category.as_deref(),
        &triage.why,
    )
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

pub fn prepare_rsvp(conn: &Connection, message_id: &str) -> Result<(Runtime, Message), String> {
    let (runtime, message) = prepare(
        conn,
        message_id,
        "staff_schedule",
        "Turn on Draft an RSVP in Hire staff.",
    )?;
    if message.invite.is_none() {
        return Err("That letter has no calendar invite to answer.".into());
    }
    Ok((runtime, message))
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

pub fn rsvp(runtime: &Runtime, message: &Message) -> Result<StaffDraft, String> {
    let text = complete(
        runtime,
        "You draft an RSVP on a local mail desk. Never send. Plain text only. No subject line. Do not introduce the draft. The editor still has to Send. Be concise. If the invite is cancelled, acknowledge that. Otherwise write a short accept unless the letter clearly cannot make it.",
        &format!("{}\n\nWrite an RSVP.", letter_prompt(message)),
    )?;
    Ok(StaffDraft {
        body: text.trim().to_string(),
    })
}

const BRIEF_LIMIT: usize = 12;
const NEW_MAIL_LIMIT: usize = 8;

pub fn brief_id(account_id: Option<&str>) -> String {
    match account_id {
        Some(id) if !id.is_empty() => format!("brief:{id}"),
        _ => "brief:all".into(),
    }
}

pub fn load_brief(conn: &Connection, account_id: Option<&str>) -> Result<Option<StaffBrief>, String> {
    match db::staff_note(conn, &brief_id(account_id), "brief")? {
        Some((body, extra, at)) => Ok(Some(StaffBrief {
            blurb: body,
            items: parse_brief_items(&extra),
            at,
        })),
        None => Ok(None),
    }
}

pub fn prepare_brief(
    conn: &Connection,
    account_id: Option<&str>,
) -> Result<(Runtime, Vec<Message>), String> {
    if !db::pref_bool_or(conn, "staff_summarize_account", false)? {
        return Err("Turn on Summarize this account in Hire staff.".into());
    }
    let runtime = runtime(conn)?;
    let letters = db::brief_candidates(conn, account_id, BRIEF_LIMIT)?;
    Ok((runtime, letters))
}

pub fn write_brief(runtime: &Runtime, letters: &[Message]) -> Result<StaffBrief, String> {
    if letters.is_empty() {
        return Ok(StaffBrief {
            blurb: "Nothing needs you right now.".into(),
            items: Vec::new(),
            at: chrono::Utc::now().to_rfc3339(),
        });
    }
    let text = complete(
        runtime,
        "You are the editor-in-chief of a local mail desk. Write a morning brief. Reply with JSON only: {\"blurb\":\"two to four sentences on what needs the editor\",\"items\":[{\"id\":\"the id given\",\"line\":\"one clause\"}]}. Use only the ids you were given. No greeting. No markdown.",
        &brief_prompt(letters),
    )?;
    Ok(parse_brief(&text, letters))
}

pub fn store_brief(
    conn: &Connection,
    account_id: Option<&str>,
    brief: &StaffBrief,
) -> Result<(), String> {
    let extra = serde_json::to_string(&brief.items).unwrap_or_else(|_| "[]".into());
    db::set_staff_note(conn, &brief_id(account_id), "brief", &brief.blurb, &extra)
}

pub fn prepare_new(conn: &Connection, ids: &[String]) -> Result<Option<(Runtime, Vec<Message>)>, String> {
    if ids.is_empty() {
        return Ok(None);
    }
    if !db::pref_bool_or(conn, "staff_summarize_new", false)? {
        return Ok(None);
    }
    if !secrets::staff_key_present() {
        return Ok(None);
    }
    let runtime = match runtime(conn) {
        Ok(runtime) => runtime,
        Err(_) => return Ok(None),
    };
    let mut letters = Vec::new();
    for id in ids.iter().take(NEW_MAIL_LIMIT) {
        if db::staff_note(conn, id, "summary")?.is_some() {
            continue;
        }
        let Ok(message) = db::get_message(conn, id) else {
            continue;
        };
        if message.folder == "inbox" && message.unread {
            letters.push(message);
        }
    }
    if letters.is_empty() {
        Ok(None)
    } else {
        Ok(Some((runtime, letters)))
    }
}

pub fn run_new_mail(app: &tauri::AppHandle, ids: &[String]) {
    use tauri::{Emitter, Manager};
    if ids.is_empty() {
        return;
    }
    let summaries = {
        let state = app.state::<crate::AppState>();
        let Ok(conn) = state.db.lock() else {
            return;
        };
        match prepare_new(&conn, ids) {
            Ok(Some(work)) => Some(work),
            _ => None,
        }
    };
    if let Some((runtime, letters)) = summaries {
        for message in letters {
            if let Ok(summary) = summarize(&runtime, &message) {
                let state = app.state::<crate::AppState>();
                let locked = state.db.lock();
                if let Ok(conn) = locked {
                    let _ = store_summary(&conn, &message.id, &summary);
                }
            }
        }
    }
    let triage_batch = {
        let state = app.state::<crate::AppState>();
        let Ok(conn) = state.db.lock() else {
            return;
        };
        match prepare_new_triage(&conn, ids) {
            Ok(Some(work)) => Some(work),
            _ => None,
        }
    };
    let mut moved = false;
    if let Some((runtime, letters)) = triage_batch {
        for message in letters {
            let Ok(decision) = decide_triage(&runtime, &message) else {
                continue;
            };
            let state = app.state::<crate::AppState>();
            let locked = state.db.lock();
            if let Ok(conn) = locked {
                if store_triage(&conn, &message.id, &decision).is_ok() {
                    moved = true;
                }
            }
        }
    }
    if !moved {
        return;
    }
    let mailbox = {
        let state = app.state::<crate::AppState>();
        let Ok(conn) = state.db.lock() else {
            return;
        };
        db::load_mailbox(&conn).ok()
    };
    if let Some(mailbox) = mailbox {
        let _ = app.emit("mailbox-updated", mailbox);
    }
}

pub fn prepare_new_triage(
    conn: &Connection,
    ids: &[String],
) -> Result<Option<(Runtime, Vec<Message>)>, String> {
    if ids.is_empty() {
        return Ok(None);
    }
    if !db::pref_bool_or(conn, "staff_triage_new", false)? {
        return Ok(None);
    }
    if !secrets::staff_key_present() {
        return Ok(None);
    }
    let runtime = match runtime(conn) {
        Ok(runtime) => runtime,
        Err(_) => return Ok(None),
    };
    let mut letters = Vec::new();
    for id in ids.iter().take(NEW_MAIL_LIMIT) {
        if db::staff_note(conn, id, "triage")?.is_some() {
            continue;
        }
        let Ok(message) = db::get_message(conn, id) else {
            continue;
        };
        if message.folder != "inbox" || !message.unread {
            continue;
        }
        if db::sender_locked_reading(conn, &message.from_email).unwrap_or(false) {
            continue;
        }
        if keep_local_action(message.category.as_deref()) {
            continue;
        }
        letters.push(message);
    }
    if letters.is_empty() {
        Ok(None)
    } else {
        Ok(Some((runtime, letters)))
    }
}

fn runtime(conn: &Connection) -> Result<Runtime, String> {
    Ok(Runtime {
        provider: parse_provider(&db::pref_string(conn, "staff_provider", "openai")?)?.to_string(),
        model: db::pref_string(conn, "staff_model", "")?,
        endpoint: db::pref_string(conn, "staff_endpoint", "")?,
        key: secrets::load_staff_key()?,
    })
}

fn brief_prompt(letters: &[Message]) -> String {
    let mut out = String::from("Unread Action mail, newest first:\n");
    for letter in letters {
        out.push_str(&format!(
            "\nid={}\nFrom: {}\nSubject: {}\nPreview: {}\n",
            letter.id,
            if letter.from_name.is_empty() {
                letter.from_email.clone()
            } else {
                format!("{} <{}>", letter.from_name, letter.from_email)
            },
            letter.subject,
            clip_text(&letter.preview, 280)
        ));
    }
    out
}

fn parse_brief(raw: &str, letters: &[Message]) -> StaffBrief {
    let cleaned = strip_fences(raw);
    let known: std::collections::HashSet<&str> = letters.iter().map(|m| m.id.as_str()).collect();
    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        let blurb = value["blurb"]
            .as_str()
            .unwrap_or(cleaned)
            .trim()
            .to_string();
        let items = value["items"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let id = item["id"].as_str().unwrap_or_default().trim();
                        if !known.contains(id) {
                            return None;
                        }
                        let line = item["line"]
                            .as_str()
                            .or_else(|| item["blurb"].as_str())
                            .unwrap_or("")
                            .trim();
                        if line.is_empty() {
                            return None;
                        }
                        Some(StaffBriefItem {
                            id: id.to_string(),
                            line: line.to_string(),
                        })
                    })
                    .take(8)
                    .collect()
            })
            .unwrap_or_default();
        if !blurb.is_empty() {
            return StaffBrief {
                blurb,
                items,
                at: chrono::Utc::now().to_rfc3339(),
            };
        }
    }
    StaffBrief {
        blurb: cleaned.trim().to_string(),
        items: Vec::new(),
        at: chrono::Utc::now().to_rfc3339(),
    }
}

fn parse_brief_items(extra: &str) -> Vec<StaffBriefItem> {
    serde_json::from_str(extra).unwrap_or_default()
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
    let runtime = runtime(conn)?;
    let message = db::get_message(conn, message_id)?;
    Ok((runtime, message))
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
    let mut prompt = format!(
        "From: {}\nSubject: {}\n---\n{}",
        from,
        message.subject,
        clip_text(body, BODY_LIMIT)
    );
    if let Some(invite) = &message.invite {
        prompt.push_str("\n\nMeeting invite:\n");
        prompt.push_str(&format!("Title: {}\nWhen: {}\n", invite.summary, invite.when));
        if let Some(location) = &invite.location {
            prompt.push_str(&format!("Where: {location}\n"));
        }
        if let Some(organizer) = &invite.organizer {
            prompt.push_str(&format!("Organizer: {organizer}\n"));
        }
        prompt.push_str(&format!("Method: {}\n", invite.method));
        if invite.cancelled {
            prompt.push_str("This invite is cancelled.\n");
        }
    }
    prompt
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
    let mut req = agent()?
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
        agent()?
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
    let requested = gemini_model_name(model);
    match gemini_generate(key, &requested, system, user) {
        Ok(text) => Ok(text),
        Err(err) if looks_like_missing_model(&err) => {
            match discover_gemini_model(key) {
                Ok(found) if found != requested => gemini_generate(key, &found, system, user),
                _ => Err(err),
            }
        }
        Err(err) => Err(err),
    }
}

fn gemini_generate(key: &str, model: &str, system: &str, user: &str) -> Result<String, String> {
    let value = send_json(
        agent()?
            .post(&gemini_url(model))
            .set("x-goog-api-key", key)
            .set("Content-Type", "application/json"),
        json!({
            "contents": [{"parts": [{"text": format!("{system}\n\n{user}")}]}],
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
            let body = resp.into_string().unwrap_or_default();
            Err(status_error(code, &body))
        }
        Err(ureq::Error::Transport(err)) => Err(transport_error(&err)),
    }
}

fn status_error(code: u16, body: &str) -> String {
    let detail = provider_message(body);
    match code {
        401 | 403 => match detail {
            Some(msg) => format!("The provider refused the key. {msg}"),
            None => "The provider refused the key.".into(),
        },
        404 => match detail {
            Some(msg) => format!("That Gemini model was not found. {msg}"),
            None => "That Gemini model was not found. Set Model in Hire staff to gemini-flash-latest.".into(),
        },
        429 => "The provider asked us to slow down.".into(),
        _ => detail.unwrap_or_else(|| format!("The provider returned {code}.")),
    }
}

fn provider_message(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    let msg = value["error"]["message"]
        .as_str()
        .or_else(|| value["message"].as_str())?
        .trim();
    if msg.is_empty() || msg.len() > 240 {
        return None;
    }
    Some(msg.to_string())
}

fn transport_error(err: &ureq::Transport) -> String {
    match err.kind() {
        ureq::ErrorKind::Dns => "Could not resolve the provider host.".into(),
        ureq::ErrorKind::ConnectionFailed => {
            "Could not open a TLS connection to the provider.".into()
        }
        ureq::ErrorKind::Io => "The connection to the provider dropped.".into(),
        ureq::ErrorKind::InvalidUrl => "The provider URL is not valid.".into(),
        _ => match err.message() {
            Some(msg) if !msg.is_empty() && msg.len() < 160 && !msg.contains("key=") => {
                format!("Could not reach the provider. {msg}")
            }
            _ => "Could not reach the provider.".into(),
        },
    }
}

fn agent() -> Result<ureq::Agent, String> {
    let mut tls = crate::tls::client_config(false)?;
    tls.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(ureq::AgentBuilder::new()
        .timeout(TIMEOUT)
        .tls_config(Arc::new(tls))
        .build())
}

fn gemini_url(model: &str) -> String {
    format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        gemini_model_name(model)
    )
}

fn gemini_model_name(model: &str) -> String {
    let name = model.trim().trim_start_matches("models/");
    let name = name.split(':').next().unwrap_or(name).trim();
    let cleaned: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    if cleaned.is_empty() {
        "gemini-flash-latest".into()
    } else {
        cleaned
    }
}

fn looks_like_missing_model(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("not found") || lower.contains("404")
}

fn discover_gemini_model(key: &str) -> Result<String, String> {
    let value = match agent()?
        .get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200")
        .set("x-goog-api-key", key)
        .call()
    {
        Ok(resp) => resp
            .into_json::<Value>()
            .map_err(|_| "Could not read the Gemini model list.".to_string())?,
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            return Err(status_error(code, &body));
        }
        Err(ureq::Error::Transport(err)) => return Err(transport_error(&err)),
    };
    pick_gemini_model(&gemini_model_names(&value)).ok_or_else(|| {
        "This Gemini key has no generateContent model. Set Model in Hire staff.".into()
    })
}

fn gemini_model_names(value: &Value) -> Vec<String> {
    let Some(models) = value["models"].as_array() else {
        return Vec::new();
    };
    models
        .iter()
        .filter(|model| model_supports_generate(model))
        .filter_map(|model| model["name"].as_str().map(gemini_model_name))
        .filter(|name| !name.is_empty())
        .collect()
}

fn model_supports_generate(model: &Value) -> bool {
    let methods = model["supportedGenerationMethods"]
        .as_array()
        .or_else(|| model["supportedActions"].as_array());
    match methods {
        Some(items) => items.iter().any(|item| item.as_str() == Some("generateContent")),
        None => true,
    }
}

fn pick_gemini_model(names: &[String]) -> Option<String> {
    const PREFERRED: &[&str] = &[
        "gemini-flash-latest",
        "gemini-2.5-flash",
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-2.5-flash-lite",
        "gemini-flash-lite-latest",
    ];
    for pref in PREFERRED {
        if names.iter().any(|name| name == pref) {
            return Some((*pref).to_string());
        }
    }
    names
        .iter()
        .find(|name| {
            let lower = name.to_ascii_lowercase();
            lower.contains("flash")
                && !lower.contains("tts")
                && !lower.contains("image")
                && !lower.contains("live")
                && !lower.contains("audio")
        })
        .cloned()
        .or_else(|| names.first().cloned())
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
        "gemini" => Ok("gemini-flash-latest".into()),
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

fn parse_triage(raw: &str) -> StaffTriage {
    let cleaned = strip_fences(raw);
    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        let feed = value["feed"]
            .as_str()
            .unwrap_or("reading")
            .trim()
            .to_ascii_lowercase();
        let feed = if feed == "action" { "action" } else { "reading" };
        let category = value["category"]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("null"))
            .map(|s| clip_text(s, 32));
        let category = if feed == "reading" { None } else { category };
        let reason = value["reason"]
            .as_str()
            .or_else(|| value["why"].as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| clip_text(s, 280))
            .unwrap_or_else(|| {
                if feed == "action" {
                    "Staff put this on the front page.".into()
                } else {
                    "Staff put this in Reading.".into()
                }
            });
        return StaffTriage {
            feed: feed.into(),
            category,
            why: format!("Staff: {reason}"),
        };
    }
    StaffTriage {
        feed: "reading".into(),
        category: None,
        why: "Staff: Could not read a triage decision; left in Reading.".into(),
    }
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
        assert_eq!(resolved_model("gemini", "").unwrap(), "gemini-flash-latest");
    }

    #[test]
    fn gemini_url_uses_google_colon() {
        let url = gemini_url("models/gemini-flash-latest:generateContent");
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
        );
        assert!(!url.contains('?'));
        assert!(!url.contains("key="));
        assert!(!url.contains("%3A"));
    }

    #[test]
    fn google_error_body_is_surfaced() {
        let msg = status_error(
            403,
            r#"{"error":{"message":"API key not valid. Please pass a valid API key."}}"#,
        );
        assert!(msg.contains("API key not valid"));
    }

    #[test]
    fn picks_flash_latest_from_model_list() {
        let names = vec![
            "gemini-2.5-pro".into(),
            "gemini-flash-latest".into(),
            "gemini-2.5-flash-preview-tts".into(),
        ];
        assert_eq!(pick_gemini_model(&names).unwrap(), "gemini-flash-latest");
    }

    #[test]
    fn brief_id_is_per_mailbox() {
        assert_eq!(brief_id(None), "brief:all");
        assert_eq!(brief_id(Some("abc")), "brief:abc");
    }

    #[test]
    fn parse_brief_keeps_known_ids() {
        let letter = bateleur_core::Message {
            id: "m1".into(),
            account_id: "a".into(),
            feed: "action".into(),
            from_name: "Sam".into(),
            from_email: "sam@x.test".into(),
            subject: "Q3".into(),
            preview: "Need a look".into(),
            body: String::new(),
            html_body: None,
            received_at: String::new(),
            unread: true,
            waiting_on: false,
            flagged: false,
            folder: "inbox".into(),
            hero: None,
            attachments: vec![],
            category: None,
            why: None,
            to_email: String::new(),
            cc_email: String::new(),
            rfc_id: None,
            in_reply_to: None,
            invite: None,
        };
        let brief = parse_brief(
            r#"{"blurb":"Two letters need you.","items":[{"id":"m1","line":"Sam wants a look at Q3"},{"id":"nope","line":"ignore"}]}"#,
            &[letter],
        );
        assert_eq!(brief.blurb, "Two letters need you.");
        assert_eq!(brief.items.len(), 1);
        assert_eq!(brief.items[0].id, "m1");
    }

    #[test]
    fn parse_triage_front_page() {
        let triage = parse_triage(
            r#"{"feed":"action","category":"Please reply","reason":"Asks for a spec review today."}"#,
        );
        assert_eq!(triage.feed, "action");
        assert_eq!(triage.category.as_deref(), Some("Please reply"));
        assert!(triage.why.starts_with("Staff:"));
        assert!(triage.why.contains("spec review"));
    }

    #[test]
    fn parse_triage_reading_drops_category() {
        let triage = parse_triage(
            "```json\n{\"feed\":\"reading\",\"category\":\"Invoice\",\"reason\":\"A newsletter.\"}\n```",
        );
        assert_eq!(triage.feed, "reading");
        assert_eq!(triage.category, None);
        assert!(triage.why.contains("newsletter"));
    }

    #[test]
    fn parse_triage_garbage_stays_reading() {
        let triage = parse_triage("not json");
        assert_eq!(triage.feed, "reading");
        assert!(triage.why.contains("Could not read"));
    }
}
