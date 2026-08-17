mod attach;
mod db;
mod imap;
mod parse;
mod pop;
mod secrets;
mod smtp;
mod tls;
mod watch;

use bateleur_core::{
    guess_servers, parse_message_ref, Account, AccountDraft, FlagChange, Mailbox, SendDraft,
    ServerGuess,
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
    let password = secrets::load_password(&account.address)?;
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
        db::apply_fetch(
            &conn,
            &account.id,
            &fetched.folders,
            &fetched.messages,
            &fetched.parts,
            &fetched.pop_uidls,
        )?
    };
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
    let password = secrets::load_password(&account.address)?;
    let to_send = account.clone();
    let payload = draft.clone();
    let (mut sent, rfc822, mut parts) =
        tauri::async_runtime::spawn_blocking(move || smtp::send(&to_send, &password, &payload))
            .await
            .map_err(|e| e.to_string())??;

    let password = secrets::load_password(&account.address)?;
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
        db::load_mailbox(&conn)?
    };
    Ok(mailbox)
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
    let password = secrets::load_password(&account.address)?;
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
    let password = secrets::load_password(&account.address)?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            sync_account,
            send_mail,
            set_flag,
            archive_message,
            inline_parts,
            save_attachment,
            remove_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
