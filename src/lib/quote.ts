import { readableText } from "./emailHtml";
import { formatWhen } from "./magazine";
import { emailsIn, isNoReply } from "./waiting";

export type ComposeQuote = {
  fromName: string;
  fromEmail: string;
  at: string;
  body: string;
};

const MAX_QUOTE = 8000;

export function replySubject(subject: string): string {
  const value = readableText(subject).trim();
  if (!value) return "Re:";
  return /^(re|aw|sv|antw)\s*:/i.test(value) ? value : `Re: ${value}`;
}

export function forwardSubject(subject: string): string {
  const value = readableText(subject).trim();
  if (!value) return "Fwd:";
  return /^(fw|fwd|wg|rv|ref)\s*:/i.test(value) ? value : `Fwd: ${value}`;
}

function uniqueAddresses(values: string[], own: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const email = raw.trim().toLowerCase();
    if (!email || own.has(email) || isNoReply(email) || out.includes(email)) continue;
    out.push(email);
  }
  return out;
}

export function ownAddresses(accounts: { address: string }[]): Set<string> {
  return new Set(accounts.map((account) => account.address.trim().toLowerCase()).filter(Boolean));
}

export function replyTo(
  message: { folder?: string; fromEmail?: string; toEmail?: string },
  own: Set<string>,
): string {
  if (message.folder === "sent") {
    return uniqueAddresses(emailsIn(message.toEmail ?? ""), own)[0] ?? "";
  }
  const from = (message.fromEmail ?? "").trim().toLowerCase();
  if (from && !own.has(from)) return from;
  return uniqueAddresses(emailsIn(message.toEmail ?? ""), own)[0] ?? from;
}

export function replyAllTo(
  message: { folder?: string; fromEmail?: string; toEmail?: string; ccEmail?: string },
  own: Set<string>,
): string {
  const people = uniqueAddresses(
    [
      ...(message.folder === "sent" ? [] : [message.fromEmail ?? ""]),
      ...emailsIn(message.toEmail ?? ""),
      ...emailsIn(message.ccEmail ?? ""),
    ],
    own,
  );
  return people.join(", ");
}

export function replyAllParts(
  message: { folder?: string; fromEmail?: string; toEmail?: string; ccEmail?: string },
  own: Set<string>,
): { to: string; cc: string } {
  const to = replyTo(message, own);
  const cc = replyAllTo(message, own)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((email) => email && email !== to.toLowerCase())
    .join(", ");
  return { to, cc };
}

export function hasReplyAll(
  message: { folder?: string; fromEmail?: string; toEmail?: string; ccEmail?: string },
  own: Set<string>,
): boolean {
  const people = replyAllTo(message, own)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return people.length > 1;
}

export function quoteHeading(quote: ComposeQuote): string {
  const when = formatWhen(quote.at) || quote.at;
  const who = readableText(quote.fromName) || quote.fromEmail || "Someone";
  return `On ${when}, ${who} wrote`;
}

export function clipQuote(body: string, max = MAX_QUOTE): string {
  const text = readableText(body).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function fromMessage(draft: {
  fromName?: string;
  fromEmail?: string;
  receivedAt?: string;
  body?: string;
}): ComposeQuote {
  return {
    fromName: draft.fromName ?? "",
    fromEmail: draft.fromEmail ?? "",
    at: draft.receivedAt ?? "",
    body: clipQuote(draft.body ?? ""),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function quotePlain(quote: ComposeQuote): string {
  const lines = quote.body.split("\n").map((line) => `> ${line}`);
  return `\n\n${quoteHeading(quote)}:\n${lines.join("\n")}`;
}

export function quoteHtml(quote: ComposeQuote): string {
  const paras = escapeHtml(quote.body).replace(/\n/g, "<br>");
  return `<blockquote><p>${escapeHtml(quoteHeading(quote))}:</p><p>${paras}</p></blockquote>`;
}

export function withQuote(
  html: string,
  plain: string,
  quote: ComposeQuote | null,
): { html: string; body: string } {
  if (!quote) return { html, body: plain };
  return {
    html: `${html}${quoteHtml(quote)}`,
    body: `${plain}${quotePlain(quote)}`,
  };
}
