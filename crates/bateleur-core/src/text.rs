/// Turn HTML / entity soup into readable plain text.
/// Strips tags (`<strong>`, `<b>`, `<bold>`, …), decodes `&nbsp;` and friends,
/// and collapses leftover whitespace. Safe for subjects, from-names, previews,
/// and the plain-text body.
pub fn html_to_plain(input: &str) -> String {
    let once = decode_entities(&strip_tags(&strip_blocks(input)));
    let twice = if once.contains('<') {
        decode_entities(&strip_tags(&once))
    } else {
        once
    };
    normalize_plain(&twice)
}

/// One-line summary: same cleanup, then a single collapsed line.
pub fn preview_text(input: &str, max_chars: usize) -> String {
    let line: String = html_to_plain(input)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    line.chars().take(max_chars).collect()
}

fn strip_blocks(html: &str) -> String {
    let mut out = html.to_string();
    for tag in ["style", "script", "head"] {
        out = strip_tag_block(&out, tag);
    }
    out
}

fn strip_tag_block(input: &str, tag: &str) -> String {
    let lower = input.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        let Some(rel) = lower.get(i..).and_then(|rest| rest.find(&open)) else {
            out.push_str(&input[i..]);
            break;
        };
        out.push_str(&input[i..i + rel]);
        let from = i + rel;
        if let Some(end) = lower.get(from..).and_then(|rest| rest.find(&close)) {
            i = from + end + close.len();
        } else {
            break;
        }
    }
    out
}

fn strip_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let name = tag_name(&tag);
                if is_break_tag(&name) {
                    out.push('\n');
                }
            }
            _ if in_tag => tag.push(c),
            _ => out.push(c),
        }
    }
    out
}

fn tag_name(tag: &str) -> String {
    tag.trim()
        .trim_start_matches('/')
        .split(|c: char| c.is_whitespace() || c == '/' || c == '!')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_break_tag(name: &str) -> bool {
    matches!(
        name,
        "br" | "p"
            | "div"
            | "tr"
            | "li"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "blockquote"
            | "table"
            | "hr"
    )
}

fn decode_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        match take_entity(rest) {
            Some((replacement, consumed)) => {
                out.push_str(&replacement);
                rest = &rest[consumed..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn take_entity(input: &str) -> Option<(String, usize)> {
    let body = input.strip_prefix('&')?;
    if body.starts_with('#') {
        let hex = body.as_bytes().get(1).is_some_and(|b| *b == b'x' || *b == b'X');
        let digits_start = if hex { 2 } else { 1 };
        let rest = body.get(digits_start..)?;
        let (digits, after) = split_entity_digits(rest, hex)?;
        let code = if hex {
            u32::from_str_radix(digits, 16).ok()?
        } else {
            digits.parse().ok()?
        };
        let ch = char::from_u32(code).unwrap_or('\u{FFFD}');
        let consumed = 1 + digits_start + digits.len() + usize::from(after.starts_with(';'));
        return Some((normalize_char(ch), consumed));
    }
    let (name, after) = split_entity_name(body)?;
    let replacement = named_entity(name)?;
    let consumed = 1 + name.len() + usize::from(after.starts_with(';'));
    Some((replacement.into(), consumed))
}

fn split_entity_digits(input: &str, hex: bool) -> Option<(&str, &str)> {
    let n = input
        .chars()
        .take_while(|c| {
            if hex {
                c.is_ascii_hexdigit()
            } else {
                c.is_ascii_digit()
            }
        })
        .count();
    if n == 0 {
        return None;
    }
    Some((&input[..n], &input[n..]))
}

fn split_entity_name(input: &str) -> Option<(&str, &str)> {
    let n = input
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .count();
    if n == 0 {
        return None;
    }
    Some((&input[..n], &input[n..]))
}

fn named_entity(name: &str) -> Option<&'static str> {
    Some(match name.to_ascii_lowercase().as_str() {
        "nbsp" | "ensp" | "emsp" | "thinsp" => " ",
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "ndash" => "–",
        "mdash" => "—",
        "hellip" => "…",
        "copy" => "©",
        "reg" => "®",
        "trade" => "™",
        "lsquo" | "rsquo" | "sbquo" => "'",
        "ldquo" | "rdquo" | "bdquo" => "\"",
        "bull" => "•",
        "middot" => "·",
        "times" => "×",
        "divide" => "÷",
        "plusmn" => "±",
        "deg" => "°",
        "euro" => "€",
        "pound" => "£",
        "yen" => "¥",
        _ => return None,
    })
}

fn normalize_char(ch: char) -> String {
    if ch == '\u{00A0}' || ch.is_whitespace() && ch != '\n' && ch != '\r' {
        " ".into()
    } else {
        ch.to_string()
    }
}

fn normalize_plain(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut newline = false;
    let mut space = true;
    for c in input.chars() {
        if c == '\r' {
            continue;
        }
        if c == '\n' {
            if !newline {
                if space && !out.is_empty() {
                    out.pop();
                }
                out.push('\n');
                newline = true;
                space = true;
            }
            continue;
        }
        if c.is_whitespace() || c == '\u{00A0}' {
            if !space {
                out.push(' ');
                space = true;
            }
            continue;
        }
        out.push(c);
        newline = false;
        space = false;
    }
    while out.ends_with(' ') || out.ends_with('\n') {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_nbsp_and_numeric() {
        assert_eq!(html_to_plain("Hello&nbsp;world&#160;there"), "Hello world there");
        assert_eq!(html_to_plain("Hello&#xA0;world"), "Hello world");
    }

    #[test]
    fn strips_strong_and_bold() {
        assert_eq!(html_to_plain("<strong>Alert</strong> now"), "Alert now");
        assert_eq!(html_to_plain("<b>Alert</b> now"), "Alert now");
        assert_eq!(html_to_plain("<bold>Alert</bold> now"), "Alert now");
        assert_eq!(html_to_plain("<em>hi</em>"), "hi");
    }

    #[test]
    fn headers_keep_ampersands() {
        assert_eq!(html_to_plain("Acme &amp; Co"), "Acme & Co");
        assert_eq!(html_to_plain("Q&amp;A: <strong>read</strong>"), "Q&A: read");
    }

    #[test]
    fn preview_is_one_line() {
        let html = "<p>Hello&nbsp;there</p><p><strong>Friend</strong></p>";
        assert_eq!(preview_text(html, 180), "Hello there Friend");
    }
}
