mod alerts;
mod attach;
mod db;
mod imap;
mod oauth;
mod parse;
mod pop;
mod secrets;
mod smtp;
mod staff;
mod tls;
mod watch;

use bateleur_core::{
    guess_servers, parse_message_ref, Account, AccountDraft, FlagChange, MailFolder, Mailbox,
    SendDraft, ServerGuess,
};
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub(crate) struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub stops: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[tauri::command]
fn mailbox(state: State<AppState>) -> Result<Mailbox, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::load_mailbox(&conn)
}

#[tauri::command]
fn guess_account_servers(address: String) -> Option<ServerGuess> {
    guess_servers(&address)
}

#[tauri::command]
async fn add_account(
    app: AppHandle,
    state: State<'_, AppState>,
    draft: AccountDraft,
) -> Result<Mailbox, String> {
    if draft.kind != "imap" && draft.kind != "pop" {
        return Err("Choose IMAP or POP.".into());
    }
    if draft.address.trim().is_empty() || draft.password.is_empty() {
        return Err("Address and password are required.".into());
    }
    if draft.imap_host.trim().is_empty() {
        return Err(if draft.kind == "pop" {
            "POP host is required.".into()
        } else {
            "IMAP host is required.".into()
        });
    }

    let local = draft
        .address
        .split('@')
        .next()
        .unwrap_or("account")
        .to_string();
    let address = draft.address.trim().to_lowercase();
    let existing_id = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account_by_address(&conn, &address)?.map(|a| a.id)
    };
    let account = Account {
        id: existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        address,
        label: if draft.label.trim().is_empty() {
            local
        } else {
            draft.label.trim().to_string()
        },
        kind: if draft.kind == "pop" {
            "pop".into()
        } else {
            "imap".into()
        },
        imap_host: Some(draft.imap_host.trim().to_string()),
        imap_port: Some(draft.imap_port),
        imap_user: Some(if draft.imap_user.trim().is_empty() {
            draft.address.trim().to_lowercase()
        } else {
            draft.imap_user.trim().to_string()
        }),
        smtp_host: Some(draft.smtp_host.trim().to_string()),
        smtp_port: Some(draft.smtp_port),
        smtp_user: Some(if draft.smtp_user.trim().is_empty() {
            draft.address.trim().to_lowercase()
        } else {
            draft.smtp_user.trim().to_string()
        }),
        trust_tls: draft.trust_tls,
        auth: "password".into(),
    };

    let password = draft.password.clone();
    let to_fetch = account.clone();
    let known = if account.kind == "pop" {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::pop_uidls(&conn, &account.id).unwrap_or_default()
    } else {
        std::collections::HashSet::new()
    };
    let fetched = tauri::async_runtime::spawn_blocking(move || {
        if to_fetch.kind == "pop" {
            pop::fetch_account(&to_fetch, &password, &known)
        } else {
            imap::fetch_account(&to_fetch, &password)
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let stored: String = draft.password.chars().filter(|c| !c.is_whitespace()).collect();
    secrets::save_password(&account.address, &stored)?;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::upsert_account(&conn, &account)?;
        db::apply_fetch(
            &conn,
            &account.id,
            &fetched.folders,
            &fetched.messages,
            &fetched.parts,
            &fetched.pop_uidls,
        )?
    };
    watch::start(app, account.id.clone());
    Ok(mailbox)
}

#[tauri::command]
fn oauth_status(app: AppHandle) -> Result<oauth::OAuthStatus, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(oauth::status(&dir))
}

#[tauri::command]
fn save_oauth_clients(
    app: AppHandle,
    google: String,
    microsoft: String,
) -> Result<oauth::OAuthStatus, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    oauth::save_clients(&dir, google, microsoft)?;
    Ok(oauth::status(&dir))
}

#[tauri::command]
async fn add_account_oauth(
    app: AppHandle,
    state: State<'_, AppState>,
    mut draft: AccountDraft,
    provider: String,
) -> Result<Mailbox, String> {
    fill_draft_servers(&mut draft);
    if draft.kind != "imap" && draft.kind != "pop" {
        return Err("Choose IMAP or POP.".into());
    }
    if draft.address.trim().is_empty() {
        return Err("Address is required.".into());
    }
    if draft.imap_host.trim().is_empty() {
        return Err(if draft.kind == "pop" {
            "POP host is required.".into()
        } else {
            "IMAP host is required.".into()
        });
    }

    let account = account_from_draft(&state, &draft, "xoauth2")?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let hint = account.address.clone();
    let provider = provider.clone();
    let tokens = tauri::async_runtime::spawn_blocking(move || {
        oauth::sign_in(&dir, &provider, &hint, |url| {
            tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    secrets::save_password(
        &account.address,
        &serde_json::to_string(&tokens).map_err(|e| e.to_string())?,
    )?;
    let password = tokens.access.clone();
    let to_fetch = account.clone();
    let known = if account.kind == "pop" {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::pop_uidls(&conn, &account.id).unwrap_or_default()
    } else {
        std::collections::HashSet::new()
    };
    let fetched = tauri::async_runtime::spawn_blocking(move || {
        if to_fetch.kind == "pop" {
            pop::fetch_account(&to_fetch, &password, &known)
        } else {
            imap::fetch_account(&to_fetch, &password)
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::upsert_account(&conn, &account)?;
        db::apply_fetch(
            &conn,
            &account.id,
            &fetched.folders,
            &fetched.messages,
            &fetched.parts,
            &fetched.pop_uidls,
        )?
    };
    watch::start(app, account.id.clone());
    Ok(mailbox)
}

fn fill_draft_servers(draft: &mut AccountDraft) {
    let Some(guess) = guess_servers(&draft.address) else {
        return;
    };
    if draft.imap_host.trim().is_empty() {
        if draft.kind == "pop" {
            draft.imap_host = guess.pop_host;
            if draft.imap_port == 0 || draft.imap_port == 993 {
                draft.imap_port = guess.pop_port;
            }
        } else {
            draft.imap_host = guess.imap_host;
            if draft.imap_port == 0 {
                draft.imap_port = guess.imap_port;
            }
        }
    }
    if draft.smtp_host.trim().is_empty() {
        draft.smtp_host = guess.smtp_host;
        if draft.smtp_port == 0 {
            draft.smtp_port = guess.smtp_port;
        }
    }
    if draft.imap_user.trim().is_empty() {
        draft.imap_user = guess.username.clone();
    }
    if draft.smtp_user.trim().is_empty() {
        draft.smtp_user = guess.username;
    }
}

fn account_from_draft(
    state: &State<'_, AppState>,
    draft: &AccountDraft,
    auth: &str,
) -> Result<Account, String> {
    let local = draft
        .address
        .split('@')
        .next()
        .unwrap_or("account")
        .to_string();
    let address = draft.address.trim().to_lowercase();
    let existing_id = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account_by_address(&conn, &address)?.map(|a| a.id)
    };
    Ok(Account {
        id: existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        address,
        label: if draft.label.trim().is_empty() {
            local
        } else {
            draft.label.trim().to_string()
        },
        kind: if draft.kind == "pop" {
            "pop".into()
        } else {
            "imap".into()
        },
        imap_host: Some(draft.imap_host.trim().to_string()),
        imap_port: Some(draft.imap_port),
        imap_user: Some(if draft.imap_user.trim().is_empty() {
            draft.address.trim().to_lowercase()
        } else {
            draft.imap_user.trim().to_string()
        }),
        smtp_host: Some(draft.smtp_host.trim().to_string()),
        smtp_port: Some(draft.smtp_port),
        smtp_user: Some(if draft.smtp_user.trim().is_empty() {
            draft.address.trim().to_lowercase()
        } else {
            draft.smtp_user.trim().to_string()
        }),
        trust_tls: draft.trust_tls,
        auth: auth.into(),
    })
}

#[tauri::command]
async fn sync_account(
    app: AppHandle,
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Mailbox, String> {
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &account_id)?
    };
    if account.kind != "imap" && account.kind != "pop" {
        return Err("Only IMAP and POP accounts sync.".into());
    }
    let _ = app.emit(
        "sync-status",
        watch::SyncEvent {
            account_id: account_id.clone(),
            state: "syncing".into(),
            at: None,
            message: None,
        },
    );
    let password = oauth::prepare_secret(&account)?;
    let to_fetch = account.clone();
    let known = if account.kind == "pop" {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::pop_uidls(&conn, &account.id).unwrap_or_default()
    } else {
        std::collections::HashSet::new()
    };
    let fetched = tauri::async_runtime::spawn_blocking(move || {
        if to_fetch.kind == "pop" {
            pop::fetch_account(&to_fetch, &password, &known)
        } else {
            imap::fetch_account(&to_fetch, &password)
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let existing = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::message_ids(&conn, &account.id)?
    };
    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::apply_fetch(
            &conn,
            &account.id,
            &fetched.folders,
            &fetched.messages,
            &fetched.parts,
            &fetched.pop_uidls,
        )?
    };
    let fresh: Vec<String> = fetched
        .messages
        .iter()
        .filter(|m| !existing.contains(&m.id) && m.folder == "inbox" && m.unread)
        .map(|m| m.id.clone())
        .collect();
    kick_new_mail_summaries(app.clone(), fresh);
    let _ = app.emit(
        "sync-status",
        watch::SyncEvent {
            account_id: account_id.clone(),
            state: "idle".into(),
            at: Some(chrono::Utc::now().to_rfc3339()),
            message: None,
        },
    );
    Ok(mailbox)
}

#[tauri::command]
async fn send_mail(state: State<'_, AppState>, draft: SendDraft) -> Result<Mailbox, String> {
    if !draft.confirm {
        return Err("Send is confirm-gated. Confirm the letter before it goes out.".into());
    }
    if draft.to.trim().is_empty() {
        return Err("To needs at least one address.".into());
    }
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &draft.account_id)?
    };
    let password = oauth::prepare_secret(&account)?;
    let to_send = account.clone();
    let payload = draft.clone();
    let (mut sent, rfc822, mut parts) =
        tauri::async_runtime::spawn_blocking(move || smtp::send(&to_send, &password, &payload))
            .await
            .map_err(|e| e.to_string())??;

    let password = oauth::prepare_secret(&account)?;
    let to_append = account.clone();
    if account.kind == "imap" {
        if let Ok(Some((from_imap, imap_parts))) = tauri::async_runtime::spawn_blocking(move || {
            imap::append_sent(&to_append, &password, &rfc822)
        })
        .await
        .map_err(|e| e.to_string())?
        {
            sent = from_imap;
            parts = imap_parts;
        }
    }

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::persist_message(&conn, &sent, &parts)?;
        if let Some(old) = draft.replace_id.as_deref().filter(|id| *id != sent.id) {
            let _ = db::delete_message(&conn, old);
        }
        db::load_mailbox(&conn)?
    };
    if let Some(old) = draft.replace_id.clone().filter(|id| id != &sent.id) {
        let _ = drop_server_draft(&state, &account, &old).await;
    }
    Ok(mailbox)
}

#[tauri::command]
async fn save_mail_draft(state: State<'_, AppState>, draft: SendDraft) -> Result<Mailbox, String> {
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &draft.account_id)?
    };
    let to_write = account.clone();
    let payload = draft.clone();
    let (mut letter, rfc822, mut parts) =
        tauri::async_runtime::spawn_blocking(move || smtp::stash(&to_write, &payload))
            .await
            .map_err(|e| e.to_string())??;

    if account.kind == "imap" {
        let password = oauth::prepare_secret(&account)?;
        let to_append = account.clone();
        match tauri::async_runtime::spawn_blocking(move || {
            imap::append_draft(&to_append, &password, &rfc822)
        })
        .await
        .map_err(|e| e.to_string())?
        {
            Ok(Some((from_imap, imap_parts, imap_name))) => {
                letter = from_imap;
                parts = imap_parts;
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                let _ = db::upsert_folder(
                    &conn,
                    &MailFolder {
                        account_id: account.id.clone(),
                        canonical: "drafts".into(),
                        imap_name,
                        label: "Drafts".into(),
                    },
                );
            }
            Ok(None) => {}
            Err(err) => return Err(err),
        }
    }

    if let Some(old) = draft.replace_id.clone().filter(|id| id != &letter.id) {
        let _ = drop_server_draft(&state, &account, &old).await;
    }

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::persist_message(&conn, &letter, &parts)?;
        if let Some(old) = draft.replace_id.as_deref().filter(|id| *id != letter.id) {
            let _ = db::delete_message(&conn, old);
        }
        db::load_mailbox(&conn)?
    };
    Ok(mailbox)
}

async fn drop_server_draft(
    state: &AppState,
    account: &Account,
    message_id: &str,
) -> Result<(), String> {
    if account.kind != "imap" {
        return Ok(());
    }
    let Ok((folder, uid)) = parse_message_ref(&account.id, message_id) else {
        return Ok(());
    };
    if folder != "drafts" {
        return Ok(());
    }
    let imap_name = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::imap_name_for_folder(&conn, &account.id, "drafts").unwrap_or_else(|_| "Drafts".into())
    };
    let password = oauth::prepare_secret(account)?;
    let to_run = account.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        imap::delete_uid(&to_run, &password, &imap_name, uid)
    })
    .await;
    Ok(())
}

#[tauri::command]
async fn set_flag(state: State<'_, AppState>, change: FlagChange) -> Result<Mailbox, String> {
    if change.seen.is_none() && change.flagged.is_none() {
        return Err("Nothing to change.".into());
    }
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &change.account_id)?
    };
    if account.kind == "pop" {
        let mailbox = {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            db::apply_flag_change(&conn, &change.message_id, change.seen, change.flagged)?;
            db::load_mailbox(&conn)?
        };
        return Ok(mailbox);
    }
    let (folder_key, uid) = parse_message_ref(&account.id, &change.message_id)?;
    let imap_name = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::imap_name_for_folder(&conn, &account.id, &folder_key)?
    };
    let password = oauth::prepare_secret(&account)?;
    let to_run = account.clone();
    let seen = change.seen;
    let flagged = change.flagged;
    tauri::async_runtime::spawn_blocking(move || {
        imap::set_flags(&to_run, &password, &imap_name, uid, seen, flagged)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::apply_flag_change(&conn, &change.message_id, change.seen, change.flagged)?;
        db::load_mailbox(&conn)?
    };
    Ok(mailbox)
}

#[tauri::command]
async fn archive_message(
    state: State<'_, AppState>,
    account_id: String,
    message_id: String,
) -> Result<Mailbox, String> {
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &account_id)?
    };
    if account.kind == "pop" {
        let mailbox = {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            db::delete_message(&conn, &message_id)?;
            db::load_mailbox(&conn)?
        };
        return Ok(mailbox);
    }
    let (folder_key, uid) = parse_message_ref(&account.id, &message_id)?;
    let (source_imap, dest_imap) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        (
            db::imap_name_for_folder(&conn, &account.id, &folder_key)?,
            db::archive_imap_name(&conn, &account.id)?,
        )
    };
    let password = oauth::prepare_secret(&account)?;
    let to_run = account.clone();
    tauri::async_runtime::spawn_blocking(move || {
        imap::archive_uid(&to_run, &password, &source_imap, &dest_imap, uid)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::delete_message(&conn, &message_id)?;
        db::load_mailbox(&conn)?
    };
    Ok(mailbox)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InlinePart {
    content_id: String,
    content_type: String,
    data: String,
}

#[tauri::command]
fn inline_parts(state: State<AppState>, message_id: String) -> Result<Vec<InlinePart>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let rows = db::inline_parts(&conn, &message_id)?;
    Ok(rows
        .into_iter()
        .map(|(content_id, content_type, bytes)| InlinePart {
            content_id,
            content_type,
            data: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes),
        })
        .collect())
}

#[tauri::command]
fn compose_attachments(
    state: State<AppState>,
    message_id: String,
) -> Result<Vec<bateleur_core::DraftAttachment>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::compose_attachments(&conn, &message_id)
}

#[tauri::command]
fn save_attachment(state: State<AppState>, id: String) -> Result<String, String> {
    let (filename, _content_type, bytes, stored) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::attachment_bytes(&conn, &id)?
    };
    if !stored {
        return Err("That file was too large to cache. It cannot be saved from this copy.".into());
    }
    let path = attach::save_to_downloads(&filename, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_invite(state: State<AppState>, message_id: String) -> Result<(), String> {
    let bytes = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::calendar_bytes(&conn, &message_id)?
            .ok_or_else(|| "No calendar invite is cached on this letter.".to_string())?
    };
    let path = attach::save_to_temp("invite.ics", &bytes)?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_account(
    app: AppHandle,
    state: State<AppState>,
    account_id: String,
) -> Result<Mailbox, String> {
    watch::stop(&app, &account_id);
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::remove_account(&conn, &account_id)?
    };
    let _ = secrets::delete_password(&account.address);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::load_mailbox(&conn)
}

#[tauri::command]
fn mail_alerts(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::pref_bool(&conn, "mail_alerts")
}

#[tauri::command]
fn set_mail_alerts(app: AppHandle, state: State<AppState>, on: bool) -> Result<bool, String> {
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::set_pref(&conn, "mail_alerts", if on { "1" } else { "0" })?;
    }
    if on {
        alerts::request(&app);
    }
    Ok(on)
}

#[tauri::command]
fn move_to_reading(state: State<AppState>, message_id: String) -> Result<Mailbox, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::move_to_reading(&conn, &message_id)
}

#[tauri::command]
fn reset_sender(state: State<AppState>, email: String) -> Result<Mailbox, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::reset_sender(&conn, &email)
}

#[tauri::command]
fn lock_sender_reading(state: State<AppState>, email: String) -> Result<Mailbox, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::lock_sender_reading(&conn, &email)
}

#[tauri::command]
fn search_mail(
    state: State<AppState>,
    query: String,
    account_id: Option<String>,
) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::search_ids(&conn, &query, account_id.as_deref())
}

#[tauri::command]
fn staff_status(state: State<AppState>) -> Result<staff::StaffStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    staff::status(&conn)
}

#[tauri::command]
fn save_staff(state: State<AppState>, hire: staff::StaffHire) -> Result<staff::StaffStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    staff::save(&conn, hire)
}

#[tauri::command]
fn clear_staff(state: State<AppState>) -> Result<staff::StaffStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    staff::clear(&conn)
}

#[tauri::command]
fn staff_letter(state: State<AppState>, message_id: String) -> Result<staff::StaffLetter, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    staff::letter_notes(&conn, &message_id)
}

#[tauri::command]
async fn summarize_mail(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<staff::StaffSummary, String> {
    let (runtime, message) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::prepare_summarize(&conn, &message_id)?
    };
    let summary = tauri::async_runtime::spawn_blocking(move || staff::summarize(&runtime, &message))
        .await
        .map_err(|e| e.to_string())??;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::store_summary(&conn, &message_id, &summary)?;
    }
    Ok(summary)
}

#[tauri::command]
async fn draft_reply(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<staff::StaffDraft, String> {
    let (runtime, message) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::prepare_draft(&conn, &message_id)?
    };
    let draft = tauri::async_runtime::spawn_blocking(move || staff::draft(&runtime, &message))
        .await
        .map_err(|e| e.to_string())??;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::store_draft(&conn, &message_id, &draft)?;
    }
    Ok(draft)
}

#[tauri::command]
async fn draft_rsvp(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<staff::StaffDraft, String> {
    let (runtime, message) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::prepare_rsvp(&conn, &message_id)?
    };
    let draft = tauri::async_runtime::spawn_blocking(move || staff::rsvp(&runtime, &message))
        .await
        .map_err(|e| e.to_string())??;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::store_draft(&conn, &message_id, &draft)?;
    }
    Ok(draft)
}

#[tauri::command]
async fn triage_mail(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<staff::StaffTriage, String> {
    let (runtime, message) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::prepare_triage(&conn, &message_id)?
    };
    let triage = tauri::async_runtime::spawn_blocking(move || staff::decide_triage(&runtime, &message))
        .await
        .map_err(|e| e.to_string())??;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::store_triage(&conn, &message_id, &triage)?;
    }
    Ok(triage)
}

#[tauri::command]
fn staff_brief(
    state: State<AppState>,
    account_id: Option<String>,
) -> Result<Option<staff::StaffBrief>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    staff::load_brief(&conn, account_id.as_deref())
}

#[tauri::command]
async fn summarize_account(
    state: State<'_, AppState>,
    account_id: Option<String>,
) -> Result<staff::StaffBrief, String> {
    let (runtime, letters) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::prepare_brief(&conn, account_id.as_deref())?
    };
    let brief = tauri::async_runtime::spawn_blocking(move || staff::write_brief(&runtime, &letters))
        .await
        .map_err(|e| e.to_string())??;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        staff::store_brief(&conn, account_id.as_deref(), &brief)?;
    }
    Ok(brief)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoryOverride {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    pinned: bool,
    #[serde(default)]
    rejected: bool,
    #[serde(default)]
    merge_into: Option<String>,
}

#[tauri::command]
fn story_overrides(state: State<AppState>) -> Result<HashMap<String, StoryOverride>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let raw = db::pref_string(&conn, "story_overrides", "{}")?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[tauri::command]
fn save_story_overrides(
    state: State<AppState>,
    overrides: HashMap<String, StoryOverride>,
) -> Result<HashMap<String, StoryOverride>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let raw = serde_json::to_string(&overrides).map_err(|e| e.to_string())?;
    db::set_pref(&conn, "story_overrides", &raw)?;
    Ok(overrides)
}

fn kick_new_mail_summaries(app: AppHandle, ids: Vec<String>) {
    if ids.is_empty() {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("bateleur-staff-new".into())
        .spawn(move || staff::run_new_mail(&app, &ids));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tls::install();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("bateleur.db"))?;
            app.manage(AppState {
                db: Mutex::new(conn),
                stops: Mutex::new(HashMap::new()),
            });
            watch::boot(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mailbox,
            guess_account_servers,
            add_account,
            add_account_oauth,
            oauth_status,
            save_oauth_clients,
            sync_account,
            send_mail,
            save_mail_draft,
            set_flag,
            archive_message,
            inline_parts,
            compose_attachments,
            save_attachment,
            open_invite,
            remove_account,
            mail_alerts,
            set_mail_alerts,
            move_to_reading,
            reset_sender,
            lock_sender_reading,
            search_mail,
            staff_status,
            save_staff,
            clear_staff,
            staff_letter,
            summarize_mail,
            draft_reply,
            draft_rsvp,
            triage_mail,
            staff_brief,
            summarize_account,
            story_overrides,
            save_story_overrides
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
