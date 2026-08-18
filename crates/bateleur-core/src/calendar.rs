#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingInvite {
    pub method: String,
    pub summary: String,
    pub when: String,
    #[serde(default)]
    pub starts_at: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub organizer: Option<String>,
    #[serde(default)]
    pub cancelled: bool,
}

pub fn is_calendar(content_type: &str, filename: &str) -> bool {
    let ct = content_type.to_ascii_lowercase();
    let name = filename.to_ascii_lowercase();
    ct.contains("calendar") || ct.ends_with("/ics") || name.ends_with(".ics")
}

pub fn parse_ics_bytes(bytes: &[u8]) -> Option<MeetingInvite> {
    parse_ics(&String::from_utf8_lossy(bytes))
}

pub fn parse_ics(raw: &str) -> Option<MeetingInvite> {
    let unfolded = unfold(raw);
    if !unfolded.to_ascii_uppercase().contains("BEGIN:VEVENT") {
        return None;
    }
    let mut method = String::new();
    let mut summary = String::new();
    let mut location = String::new();
    let mut organizer = String::new();
    let mut status = String::new();
    let mut dtstart = String::new();
    let mut dtstart_tz = String::new();
    let mut dtend = String::new();
    let mut dtend_tz = String::new();
    let mut in_event = false;

    for line in unfolded.lines() {
        let (name, params, value) = split_prop(line);
        let key = name.to_ascii_uppercase();
        if key == "BEGIN" && value.eq_ignore_ascii_case("VEVENT") {
            in_event = true;
            continue;
        }
        if key == "END" && value.eq_ignore_ascii_case("VEVENT") {
            break;
        }
        if key == "BEGIN" {
            continue;
        }
        if !in_event {
            if key == "METHOD" {
                method = value.to_ascii_uppercase();
            }
            continue;
        }
        match key.as_str() {
            "SUMMARY" => summary = unescape(value),
            "LOCATION" => location = unescape(value),
            "ORGANIZER" => organizer = organizer_value(params, value),
            "STATUS" => status = value.to_ascii_uppercase(),
            "DTSTART" => {
                dtstart = value.to_string();
                dtstart_tz = tzid(params).unwrap_or_default();
            }
            "DTEND" => {
                dtend = value.to_string();
                dtend_tz = tzid(params).unwrap_or_default();
            }
            _ => {}
        }
    }

    if summary.is_empty() && dtstart.is_empty() {
        return None;
    }
    if summary.is_empty() {
        summary = "(no title)".into();
    }
    let cancelled = method == "CANCEL" || status == "CANCELLED";
    let (starts_at, start_label) = format_ical_time(&dtstart, &dtstart_tz);
    let (_, end_label) = format_ical_time(&dtend, &dtend_tz);
    let mut when = match (start_label.as_str(), end_label.as_str()) {
        ("", "") => "Time not listed".into(),
        (start, "") => start.to_string(),
        (start, end) if !end.is_empty() => format!("{start} – {end}"),
        (start, _) => start.to_string(),
    };
    if cancelled {
        when = format!("Cancelled · {when}");
    } else if method == "REPLY" {
        when = format!("Reply · {when}");
    }

    Some(MeetingInvite {
        method: if method.is_empty() {
            "REQUEST".into()
        } else {
            method
        },
        summary,
        when,
        starts_at,
        location: nonempty(location),
        organizer: nonempty(organizer),
        cancelled,
    })
}

fn unfold(raw: &str) -> String {
    let mut out = String::new();
    for line in raw.lines() {
        let line = line.trim_end_matches('\r');
        if line.starts_with(' ') || line.starts_with('\t') {
            out.push_str(&line[1..]);
        } else {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(line);
        }
    }
    out
}

fn split_prop(line: &str) -> (&str, &str, &str) {
    let Some((head, value)) = line.split_once(':') else {
        return (line, "", "");
    };
    match head.split_once(';') {
        Some((name, params)) => (name, params, value),
        None => (head, "", value),
    }
}

fn tzid(params: &str) -> Option<String> {
    for part in params.split(';') {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        if key.eq_ignore_ascii_case("TZID") && !value.is_empty() {
            return Some(value.trim_matches('"').to_string());
        }
    }
    None
}

fn organizer_value(params: &str, value: &str) -> String {
    let mail = value
        .trim()
        .trim_start_matches("mailto:")
        .trim_start_matches("MAILTO:")
        .to_string();
    for part in params.split(';') {
        let Some((key, cn)) = part.split_once('=') else {
            continue;
        };
        if key.eq_ignore_ascii_case("CN") {
            let name = unescape(cn.trim_matches('"'));
            if !name.is_empty() && !mail.is_empty() {
                return format!("{name} <{mail}>");
            }
            if !name.is_empty() {
                return name;
            }
        }
    }
    mail
}

fn unescape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push('\n'),
                Some(',') => out.push(','),
                Some(';') => out.push(';'),
                Some('\\') => out.push('\\'),
                Some(other) => out.push(other),
                None => {}
            }
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

fn nonempty(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn format_ical_time(value: &str, tz: &str) -> (Option<String>, String) {
    let raw = value.trim();
    if raw.is_empty() {
        return (None, String::new());
    }
    let utc = raw.ends_with('Z');
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 {
        return (None, raw.to_string());
    }
    let year = &digits[0..4];
    let month = &digits[4..6];
    let day = &digits[6..8];
    let date = format!("{year}-{month}-{day}");
    if digits.len() < 14 {
        return (Some(format!("{date}T00:00:00")), format!("{} {} {year}", day.trim_start_matches('0'), month_name(month)));
    }
    let hour = &digits[8..10];
    let minute = &digits[10..12];
    let iso = format!("{date}T{hour}:{minute}:00");
    let stamp = if utc {
        Some(format!("{iso}Z"))
    } else {
        Some(iso)
    };
    let mut label = format!(
        "{} {mon} {year}, {hour}:{minute}",
        day.trim_start_matches('0'),
        mon = month_name(month)
    );
    if utc {
        label.push_str(" UTC");
    } else if !tz.is_empty() {
        label.push_str(" · ");
        label.push_str(tz);
    }
    (stamp, label)
}

fn month_name(month: &str) -> &'static str {
    match month {
        "01" => "Jan",
        "02" => "Feb",
        "03" => "Mar",
        "04" => "Apr",
        "05" => "May",
        "06" => "Jun",
        "07" => "Jul",
        "08" => "Aug",
        "09" => "Sep",
        "10" => "Oct",
        "11" => "Nov",
        "12" => "Dec",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REQUEST: &str = "BEGIN:VCALENDAR\r\n\
METHOD:REQUEST\r\n\
BEGIN:VEVENT\r\n\
DTSTART:20260820T150000Z\r\n\
DTEND:20260820T160000Z\r\n\
ORGANIZER;CN=Sam:mailto:sam@example.com\r\n\
SUMMARY:Spec review\r\n\
LOCATION:Zoom\r\n\
STATUS:CONFIRMED\r\n\
END:VEVENT\r\n\
END:VCALENDAR\r\n";

    #[test]
    fn parses_google_style_invite() {
        let invite = parse_ics(REQUEST).expect("invite");
        assert_eq!(invite.method, "REQUEST");
        assert_eq!(invite.summary, "Spec review");
        assert_eq!(invite.location.as_deref(), Some("Zoom"));
        assert!(invite.organizer.as_deref().unwrap().contains("Sam"));
        assert!(invite.when.contains("20 Aug 2026"));
        assert!(invite.when.contains("15:00"));
        assert!(!invite.cancelled);
        assert!(invite.starts_at.as_deref().unwrap().starts_with("2026-08-20T15:00:00"));
    }

    #[test]
    fn cancel_is_flagged() {
        let invite = parse_ics(
            "BEGIN:VCALENDAR\nMETHOD:CANCEL\nBEGIN:VEVENT\nDTSTART:20260820T150000Z\nSUMMARY:Skip\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR\n",
        )
        .unwrap();
        assert!(invite.cancelled);
        assert!(invite.when.starts_with("Cancelled"));
    }

    #[test]
    fn unfolded_summary() {
        let invite = parse_ics(
            "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Very long\n  title\nDTSTART;VALUE=DATE:20260901\nEND:VEVENT\nEND:VCALENDAR\n",
        )
        .unwrap();
        assert_eq!(invite.summary, "Very long title");
        assert!(invite.when.contains("1 Sep 2026"));
    }

    #[test]
    fn calendar_mime_and_ics_name() {
        assert!(is_calendar("text/calendar", "invite.ics"));
        assert!(is_calendar("application/ics", "meet.ICS"));
        assert!(!is_calendar("application/pdf", "doc.pdf"));
    }
}
