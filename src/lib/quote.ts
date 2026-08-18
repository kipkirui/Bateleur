import { readableText } from "./emailHtml";
import { formatWhen } from "./magazine";

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
