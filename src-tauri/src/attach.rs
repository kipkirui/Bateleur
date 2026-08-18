use bateleur_core::{is_calendar, Attachment, DraftAttachment};
use base64::Engine;
use mail_parser::MimeHeaders;
use std::path::{Path, PathBuf};

pub const MAX_STORE_BYTES: usize = 12 * 1024 * 1024;
pub const MAX_COMPOSE_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_COMPOSE_FILES: usize = 8;

pub struct StoredPart {
    pub message_id: String,
    pub meta: Attachment,
    pub bytes: Vec<u8>,
}

pub fn extract(parsed: &mail_parser::Message<'_>, message_id: &str) -> Vec<StoredPart> {
    let mut out = Vec::new();
    for (index, part) in parsed.attachments().enumerate() {
        if part.is_multipart() {
            continue;
        }
        let bytes = part.contents().to_vec();
        if bytes.is_empty() {
            continue;
        }
        let content_type = content_type_of(part);
        let filename = part
            .attachment_name()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| default_filename(index, &content_type, part.is_message()));
        let content_id = part.content_id().map(normalize_cid).filter(|s| !s.is_empty());
        let attached = part
            .content_disposition()
            .map(|d| d.is_attachment())
            .unwrap_or(false);
        let inline_disp = part
            .content_disposition()
            .map(|d| d.c_type.eq_ignore_ascii_case("inline"))
            .unwrap_or(false);
        let inline = inline_disp
            || (content_id.is_some() && content_type.starts_with("image/") && !attached);
        let stored = bytes.len() <= MAX_STORE_BYTES;
        let id = format!("{message_id}:att:{index}");
        out.push(StoredPart {
            message_id: message_id.to_string(),
            meta: Attachment {
                id,
                filename,
                content_type,
                size: bytes.len() as u64,
                content_id,
                inline,
                stored,
            },
            bytes: if stored { bytes } else { Vec::new() },
        });
    }
    for (index, part) in parsed.parts.iter().enumerate() {
        if part.is_multipart() {
            continue;
        }
        let content_type = content_type_of(part);
        let filename = part
            .attachment_name()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| default_filename(index, &content_type, part.is_message()));
        if !is_calendar(&content_type, &filename) {
            continue;
        }
        let bytes = part.contents().to_vec();
        if bytes.is_empty() || out.iter().any(|item| item.bytes == bytes) {
            continue;
        }
        let stored = bytes.len() <= MAX_STORE_BYTES;
        out.push(StoredPart {
            message_id: message_id.to_string(),
            meta: Attachment {
                id: format!("{message_id}:cal:{index}"),
                filename,
                content_type,
                size: bytes.len() as u64,
                content_id: None,
                inline: false,
                stored,
            },
            bytes: if stored { bytes } else { Vec::new() },
        });
    }
    out
}

pub fn from_draft(message_id: &str, drafts: &[DraftAttachment]) -> Result<Vec<StoredPart>, String> {
    if drafts.len() > MAX_COMPOSE_FILES {
        return Err(format!(
            "At most {MAX_COMPOSE_FILES} files on a letter."
        ));
    }
    let mut out = Vec::new();
    for (index, draft) in drafts.iter().enumerate() {
        let bytes = decode_data(&draft.data)?;
        if bytes.is_empty() {
            continue;
        }
        if bytes.len() > MAX_COMPOSE_BYTES {
            return Err(format!(
                "“{}” is larger than 8 MB.",
                draft.filename.trim()
            ));
        }
        let filename = sanitize_filename(&draft.filename);
        let content_type = if draft.content_type.trim().is_empty() {
            "application/octet-stream".into()
        } else {
            draft.content_type.trim().to_string()
        };
        let id = format!("{message_id}:att:{index}");
        out.push(StoredPart {
            message_id: message_id.to_string(),
            meta: Attachment {
                id,
                filename,
                content_type,
                size: bytes.len() as u64,
                content_id: None,
                inline: false,
                stored: true,
            },
            bytes,
        });
    }
    Ok(out)
}

pub fn save_to_downloads(filename: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.is_empty() {
        return Err("That file was too large to cache. It cannot be saved from this copy.".into());
    }
    let dir = downloads_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not open Downloads ({e})"))?;
    let path = unique_path(&dir, &sanitize_filename(filename));
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write the file ({e})"))?;
    Ok(path)
}

pub fn save_to_temp(filename: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.is_empty() {
        return Err("That invite was too large to cache.".into());
    }
    let dir = std::env::temp_dir().join("bateleur-radar");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not write a temp invite ({e})"))?;
    let path = unique_path(&dir, &sanitize_filename(filename));
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write the invite ({e})"))?;
    Ok(path)
}

pub fn normalize_cid(raw: &str) -> String {
    raw.trim().trim_start_matches('<').trim_end_matches('>').trim().to_string()
}

fn decode_data(data: &str) -> Result<Vec<u8>, String> {
    let trimmed = data.trim();
    let payload = trimmed
        .rsplit_once("base64,")
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed)
        .trim();
    base64::engine::general_purpose::STANDARD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(payload))
        .map_err(|_| "Could not read an attached file.".to_string())
}

fn content_type_of(part: &mail_parser::MessagePart<'_>) -> String {
    match part.content_type() {
        Some(ct) => match ct.c_subtype.as_deref() {
            Some(sub) if !sub.is_empty() => format!("{}/{}", ct.c_type, sub),
            _ => ct.c_type.to_string(),
        },
        None if part.is_message() => "message/rfc822".into(),
        None => "application/octet-stream".into(),
    }
}

fn default_filename(index: usize, content_type: &str, is_message: bool) -> String {
    if is_message {
        return format!("forwarded-{index}.eml");
    }
    let ext = match content_type {
        "application/pdf" => "pdf",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "text/calendar" => "ics",
        "text/plain" => "txt",
        "text/html" => "html",
        _ => "bin",
    };
    format!("attachment-{index}.{ext}")
}

pub fn sanitize_filename(name: &str) -> String {
    let leaf = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let cleaned: String = leaf
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "attachment.bin".into()
    } else {
        trimmed.to_string()
    }
}

fn downloads_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok());
    if let Some(home) = home {
        let dir = PathBuf::from(home).join("Downloads");
        if dir.is_dir() || dir.parent().is_some() {
            return dir;
        }
    }
    std::env::temp_dir()
}

fn unique_path(dir: &Path, filename: &str) -> PathBuf {
    let path = dir.join(filename);
    if !path.exists() {
        return path;
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    for n in 1..1000 {
        let candidate = if ext.is_empty() {
            dir.join(format!("{stem}-{n}"))
        } else {
            dir.join(format!("{stem}-{n}.{ext}"))
        };
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}-{}.{}", uuid::Uuid::new_v4(), ext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mail_parser::MessageParser;

    #[test]
    fn extracts_named_pdf() {
        let raw = b"From: a@b.com\r\n\
To: c@d.com\r\n\
Subject: files\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=b\r\n\
\r\n\
--b\r\n\
Content-Type: text/plain\r\n\
\r\n\
Hi\r\n\
--b\r\n\
Content-Type: application/pdf; name=\"doc.pdf\"\r\n\
Content-Disposition: attachment; filename=\"doc.pdf\"\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
UERG\r\n\
--b--\r\n";
        let parsed = MessageParser::default().parse(raw).unwrap();
        let parts = extract(&parsed, "acc:inbox:1");
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].meta.filename, "doc.pdf");
        assert!(parts[0].meta.content_type.contains("pdf"));
        assert!(!parts[0].meta.inline);
        assert_eq!(parts[0].bytes, b"PDF");
    }

    #[test]
    fn sanitize_strips_paths() {
        assert_eq!(sanitize_filename("..\\secret\\invoice.pdf"), "invoice.pdf");
        assert_eq!(sanitize_filename(""), "attachment.bin");
    }
}
