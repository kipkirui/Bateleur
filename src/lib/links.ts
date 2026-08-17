export type MailTo = {
  to: string;
  subject: string;
  body: string;
};

const URL_RE =
  /\b((?:https?:\/\/|www\.)[^\s<]+)|(?:mailto:([^\s<]+))|\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function normalizeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (!href || href.startsWith("#")) return href || null;
  const lower = href.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("file:")) {
    return null;
  }
  if (lower.startsWith("mailto:")) return href;
  if (isHttpUrl(href)) return href;
  if (lower.startsWith("www.")) return `https://${href}`;
  return null;
}

export function parseMailto(href: string): MailTo | null {
  const trimmed = href.trim();
  const without = trimmed.replace(/^mailto:/i, "");
  const [toPart, query = ""] = without.split("?");
  const to = decodeURIComponent(toPart.split("&")[0] ?? "").trim();
  if (!to) return null;
  const params = new URLSearchParams(query);
  return {
    to,
    subject: params.get("subject") ?? "",
    body: params.get("body") ?? "",
  };
}

export async function openExternal(url: string): Promise<void> {
  const href = normalizeHref(url);
  if (!href || !isHttpUrl(href)) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

export type TextPart =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string }
  | { kind: "email"; value: string; href: string };

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ kind: "text", value: text.slice(last, index) });
    }
    const raw = match[0];
    const cleaned = trimTrailingPunct(raw);
    const leftover = raw.slice(cleaned.length);
    if (/^https?:\/\//i.test(cleaned) || /^www\./i.test(cleaned)) {
      const href = cleaned.startsWith("www.") ? `https://${cleaned}` : cleaned;
      parts.push({ kind: "url", value: cleaned, href });
    } else {
      const address = cleaned.replace(/^mailto:/i, "");
      parts.push({ kind: "email", value: cleaned, href: `mailto:${address}` });
    }
    if (leftover) parts.push({ kind: "text", value: leftover });
    last = index + raw.length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last) });
  }
  return parts.length ? parts : [{ kind: "text", value: text }];
}

function trimTrailingPunct(value: string): string {
  return value.replace(/[),.;!?]+$/g, "");
}
