use crate::db;
use crate::imap;
use crate::secrets;
use crate::AppState;
use bateleur_core::Mailbox;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const IDLE_WAIT: Duration = Duration::from_secs(8 * 60);
const POLL_FALLBACK: Duration = Duration::from_secs(3 * 60);
const ERROR_BACKOFF: Duration = Duration::from_secs(5 * 60);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEvent {
    pub account_id: String,
    pub state: String,
    pub at: Option<String>,
    pub message: Option<String>,
}

pub fn boot(app: AppHandle) {
    let accounts = {
        let state = app.state::<AppState>();
        let Ok(conn) = state.db.lock() else {
            return;
        };
        db::list_accounts(&conn).unwrap_or_default()
    };
    for account in accounts {
        if account.kind == "imap" || account.kind == "pop" {
            start(app.clone(), account.id);
        }
    }
}

pub fn start(app: AppHandle, account_id: String) {
    let stop = Arc::new(AtomicBool::new(false));
    let prev = {
        let state = app.state::<AppState>();
        state
            .stops
            .lock()
            .ok()
            .and_then(|mut stops| stops.insert(account_id.clone(), stop.clone()))
    };
    if let Some(prev) = prev {
        prev.store(true, Ordering::SeqCst);
    }
    let thread_app = app.clone();
    let thread_id = account_id.clone();
    let _ = std::thread::Builder::new()
        .name(format!("bateleur-idle-{account_id}"))
        .spawn(move || watch_loop(thread_app, thread_id, stop));
}

pub fn stop(app: &AppHandle, account_id: &str) {
    let prev = {
        let state = app.state::<AppState>();
        state
            .stops
            .lock()
            .ok()
            .and_then(|mut stops| stops.remove(account_id))
    };
    if let Some(prev) = prev {
        prev.store(true, Ordering::SeqCst);
    }
}

fn watch_loop(app: AppHandle, account_id: String, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        emit(
            &app,
            &account_id,
            "syncing",
            Some(now()),
            None,
        );
        match refresh_account(&app, &account_id) {
            Ok(mailbox) => {
                emit(&app, &account_id, "idle", Some(now()), None);
                let _ = app.emit("mailbox-updated", mailbox);
            }
            Err(err) => {
                emit(&app, &account_id, "error", None, Some(err));
                if sleep_or_stop(&stop, ERROR_BACKOFF) {
                    break;
                }
                continue;
            }
        }
        emit(&app, &account_id, "watching", Some(now()), None);
        let waited = wait_for_change(&app, &account_id, &stop);
        if stop.load(Ordering::SeqCst) {
            break;
        }
        if let Err(err) = waited {
            emit(&app, &account_id, "watching", Some(now()), Some(err));
            if sleep_or_stop(&stop, POLL_FALLBACK) {
                break;
            }
        }
    }
}

fn wait_for_change(app: &AppHandle, account_id: &str, stop: &AtomicBool) -> Result<(), String> {
    let (account, password) = credentials(app, account_id)?;
    if account.kind == "pop" {
        let _ = sleep_or_stop(stop, POLL_FALLBACK);
        return Ok(());
    }
    imap::wait_inbox(&account, &password, IDLE_WAIT)
}

fn refresh_account(app: &AppHandle, account_id: &str) -> Result<Mailbox, String> {
    let (account, password, known) = {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let account = db::get_account(&conn, account_id)?;
        let known = if account.kind == "pop" {
            db::pop_uidls(&conn, &account.id)?
        } else {
            std::collections::HashSet::new()
        };
        let password = secrets::load_password(&account.address)?;
        (account, password, known)
    };
    let to_fetch = account.clone();
    let fetched = if to_fetch.kind == "pop" {
        crate::pop::fetch_account(&to_fetch, &password, &known)?
    } else {
        imap::fetch_account(&to_fetch, &password)?
    };
    let state = app.state::<AppState>();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::apply_fetch(
        &conn,
        &account.id,
        &fetched.folders,
        &fetched.messages,
        &fetched.parts,
        &fetched.pop_uidls,
    )
}

fn credentials(
    app: &AppHandle,
    account_id: &str,
) -> Result<(bateleur_core::Account, String), String> {
    let account = {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, account_id)?
    };
    if account.kind != "imap" && account.kind != "pop" {
        return Err("Only IMAP and POP accounts watch.".into());
    }
    let password = secrets::load_password(&account.address)?;
    Ok((account, password))
}

fn emit(app: &AppHandle, account_id: &str, state: &str, at: Option<String>, message: Option<String>) {
    let _ = app.emit(
        "sync-status",
        SyncEvent {
            account_id: account_id.to_string(),
            state: state.to_string(),
            at,
            message,
        },
    );
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn sleep_or_stop(stop: &AtomicBool, dur: Duration) -> bool {
    let slice = Duration::from_millis(500);
    let mut left = dur;
    while left > Duration::ZERO {
        if stop.load(Ordering::SeqCst) {
            return true;
        }
        let step = slice.min(left);
        std::thread::sleep(step);
        left = left.saturating_sub(step);
    }
    stop.load(Ordering::SeqCst)
}
