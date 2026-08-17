/// How an IMAP mailbox maps onto Bateleur's folder rail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassifiedFolder {
    /// `inbox`, `sent`, `drafts`, `junk`, `archive`, or `custom`.
    pub canonical: &'static str,
    pub label: String,
}

/// Map a LIST name + attributes onto a canonical folder, or skip it.
///
/// `attributes` are IMAP name attributes such as `\\Sent` or `\\Noselect`.
pub fn classify_imap_folder(name: &str, attributes: &[&str]) -> Option<ClassifiedFolder> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    let attrs: Vec<String> = attributes
        .iter()
        .map(|a| a.trim().to_ascii_lowercase())
        .collect();
    if attrs.iter().any(|a| a == "\\noselect" || a == "noselect") {
        return None;
    }

    let lower = trimmed.to_ascii_lowercase();
    if skip_name(&lower) || attrs.iter().any(|a| skip_special(a)) {
        return None;
    }

    let from_attr = attrs.iter().find_map(|a| special_from_attr(a));
    let from_name = special_from_name(&lower);
    let canonical = from_attr.or(from_name).unwrap_or("custom");
    if canonical == "trash" {
        return None;
    }
    Some(ClassifiedFolder {
        canonical,
        label: folder_label(trimmed),
    })
}

fn skip_special(attr: &str) -> bool {
    attr.contains("\\flagged") || attr.contains("\\important") || attr.contains("\\trash")
}

fn skip_name(lower: &str) -> bool {
    let leaf = leaf_name(lower);
    matches!(
        leaf,
        "important" | "starred" | "flagged" | "trash" | "deleted items" | "bin"
    ) || lower.contains("[gmail]/important")
        || lower.contains("[gmail]/starred")
        || lower.contains("[gmail]/trash")
}

fn special_from_attr(attr: &str) -> Option<&'static str> {
    if attr.contains("\\inbox") {
        return Some("inbox");
    }
    if attr.contains("\\sent") {
        return Some("sent");
    }
    if attr.contains("\\draft") {
        return Some("drafts");
    }
    if attr.contains("\\junk") || attr.contains("\\spam") {
        return Some("junk");
    }
    if attr.contains("\\archive") || attr.contains("\\all") {
        return Some("archive");
    }
    if attr.contains("\\trash") || attr.contains("\\deleted") {
        return Some("trash");
    }
    None
}

fn special_from_name(lower: &str) -> Option<&'static str> {
    if lower == "inbox" {
        return Some("inbox");
    }
    let leaf = leaf_name(lower);
    if leaf == "sent"
        || leaf == "sent mail"
        || leaf == "sent items"
        || leaf == "sent messages"
        || lower.ends_with("/sent")
        || lower.ends_with(".sent")
    {
        return Some("sent");
    }
    if leaf == "drafts" || leaf == "draft" {
        return Some("drafts");
    }
    if leaf == "junk"
        || leaf == "spam"
        || leaf == "junk e-mail"
        || leaf == "junk email"
        || leaf == "bulk mail"
    {
        return Some("junk");
    }
    if leaf == "archive" || leaf == "all mail" || leaf == "all" {
        return Some("archive");
    }
    if leaf == "trash" || leaf == "deleted items" || leaf == "bin" {
        return Some("trash");
    }
    None
}

fn leaf_name(name: &str) -> &str {
    name.rsplit(['/', '.', '\\'])
        .next()
        .unwrap_or(name)
        .trim()
}

fn folder_label(name: &str) -> String {
    let leaf = name
        .rsplit(['/', '.', '\\'])
        .next()
        .unwrap_or(name)
        .trim();
    if leaf.eq_ignore_ascii_case("inbox") {
        return "Inbox".into();
    }
    leaf.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gmail_specials() {
        let sent = classify_imap_folder("[Gmail]/Sent Mail", &["\\Sent"]).unwrap();
        assert_eq!(sent.canonical, "sent");
        assert_eq!(sent.label, "Sent Mail");
        let drafts = classify_imap_folder("[Gmail]/Drafts", &["\\Drafts"]).unwrap();
        assert_eq!(drafts.canonical, "drafts");
        let junk = classify_imap_folder("[Gmail]/Spam", &["\\Junk"]).unwrap();
        assert_eq!(junk.canonical, "junk");
        let archive = classify_imap_folder("[Gmail]/All Mail", &["\\All"]).unwrap();
        assert_eq!(archive.canonical, "archive");
        assert_eq!(
            classify_imap_folder("Archive", &["\\Archive"])
                .unwrap()
                .canonical,
            "archive"
        );
        assert!(classify_imap_folder("[Gmail]/Trash", &["\\Trash"]).is_none());
        assert!(classify_imap_folder("[Gmail]/Starred", &["\\Flagged"]).is_none());
    }

    #[test]
    fn outlook_names() {
        assert_eq!(
            classify_imap_folder("Sent Items", &[]).unwrap().canonical,
            "sent"
        );
        assert_eq!(
            classify_imap_folder("Junk Email", &[]).unwrap().canonical,
            "junk"
        );
        assert_eq!(
            classify_imap_folder("Junk E-mail", &[]).unwrap().canonical,
            "junk"
        );
        assert!(classify_imap_folder("Deleted Items", &[]).is_none());
    }

    #[test]
    fn inbox_and_custom() {
        assert_eq!(
            classify_imap_folder("INBOX", &[]).unwrap().canonical,
            "inbox"
        );
        let work = classify_imap_folder("Work", &[]).unwrap();
        assert_eq!(work.canonical, "custom");
        assert_eq!(work.label, "Work");
        assert!(classify_imap_folder("Archive", &["\\Noselect"]).is_none());
    }
}
