mod db;
mod imap;
mod secrets;
mod smtp;
mod tls;

use bateleur_core::{guess_servers, Account, AccountDraft, Mailbox, SendDraft, ServerGuess};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    db: Mutex<rusqlite::Connection>,
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
async fn add_account(state: State<'_, AppState>, draft: AccountDraft) -> Result<Mailbox, String> {
    if draft.kind == "pop" {
        return Err("POP ingest is next. Use IMAP if the host offers it.".into());
    }
    if draft.address.trim().is_empty() || draft.password.is_empty() {
        return Err("Address and password are required.".into());
    }
    if draft.imap_host.trim().is_empty() {
        return Err("IMAP host is required.".into());
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
        kind: "imap".into(),
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
    let fetched = tauri::async_runtime::spawn_blocking(move || imap::fetch_inbox(&to_fetch, &password))
        .await
        .map_err(|e| e.to_string())??;

    let stored: String = draft.password.chars().filter(|c| !c.is_whitespace()).collect();
    secrets::save_password(&account.address, &stored)?;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::upsert_account(&conn, &account)?;
        for message in fetched {
            db::upsert_message(&conn, &message)?;
        }
        db::load_mailbox(&conn)?
    };
    Ok(mailbox)
}

#[tauri::command]
async fn sync_account(state: State<'_, AppState>, account_id: String) -> Result<Mailbox, String> {
    let account = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &account_id)?
    };
    if account.kind != "imap" {
        return Err("Only IMAP accounts sync.".into());
    }
    let password = secrets::load_password(&account.address)?;
    let to_fetch = account.clone();
    let fetched = tauri::async_runtime::spawn_blocking(move || imap::fetch_inbox(&to_fetch, &password))
        .await
        .map_err(|e| e.to_string())??;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        for message in fetched {
            db::upsert_message(&conn, &message)?;
        }
        db::load_mailbox(&conn)?
    };
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
    let sent = tauri::async_runtime::spawn_blocking(move || smtp::send(&to_send, &password, &payload))
        .await
        .map_err(|e| e.to_string())??;

    let mailbox = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::upsert_message(&conn, &sent)?;
        db::load_mailbox(&conn)?
    };
    Ok(mailbox)
}

#[tauri::command]
fn remove_account(state: State<AppState>, account_id: String) -> Result<Mailbox, String> {
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
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mailbox,
            guess_account_servers,
            add_account,
            sync_account,
            send_mail,
            remove_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
