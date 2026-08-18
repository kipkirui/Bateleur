use crate::db;
use crate::AppState;
use bateleur_core::Message;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

pub fn new_mail(app: &AppHandle, incoming: &[Message]) {
    let fresh: Vec<&Message> = incoming
        .iter()
        .filter(|m| m.folder == "inbox" && m.unread)
        .collect();
    if fresh.is_empty() {
        return;
    }
    let enabled = {
        let state = app.state::<AppState>();
        let Ok(conn) = state.db.lock() else {
            return;
        };
        db::pref_bool(&conn, "mail_alerts").unwrap_or(true)
    };
    if !enabled {
        return;
    }
    let (title, body) = copy(&fresh);
    let _ = app.notification().request_permission();
    let _ = app.notification().builder().title(&title).body(&body).show();
}

pub fn request(app: &AppHandle) {
    let _ = app.notification().request_permission();
}

pub fn copy(fresh: &[&Message]) -> (String, String) {
    if fresh.len() == 1 {
        let m = fresh[0];
        let who = if m.from_name.is_empty() {
            m.from_email.as_str()
        } else {
            m.from_name.as_str()
        };
        (
            who.to_string(),
            clip(&m.subject, 120),
        )
    } else {
        let first = clip(&fresh[0].subject, 80);
        (
            format!("{} new letters", fresh.len()),
            first,
        )
    }
}

fn clip(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;
    use bateleur_core::Message;

    fn letter(from: &str, subject: &str) -> Message {
        Message {
            id: "1".into(),
            account_id: "a".into(),
            feed: "action".into(),
            from_name: from.into(),
            from_email: "ed@example.com".into(),
            subject: subject.into(),
            preview: String::new(),
            body: String::new(),
            html_body: None,
            received_at: String::new(),
            unread: true,
            waiting_on: false,
            flagged: false,
            folder: "inbox".into(),
            hero: None,
            attachments: Vec::new(),
            category: None,
            why: None,
        }
    }

    #[test]
    fn one_letter_uses_sender() {
        let m = letter("Ada", "The spec");
        let (title, body) = copy(&[&m]);
        assert_eq!(title, "Ada");
        assert_eq!(body, "The spec");
    }

    #[test]
    fn many_letters_count() {
        let a = letter("Ada", "One");
        let b = letter("Bea", "Two");
        let (title, body) = copy(&[&a, &b]);
        assert_eq!(title, "2 new letters");
        assert_eq!(body, "One");
    }
}
