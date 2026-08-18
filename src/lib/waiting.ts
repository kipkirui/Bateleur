import { readableText } from "./emailHtml";
import type { Message } from "../types";

export const WAIT_MS = 4 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = "bateleur.waitingDismissed";

const SUBJECT_PREFIX = /^(re|fw|fwd|aw|sv|antw|wg|rv|ref)\s*:\s*/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const NOREPLY = /^(no-?reply|mailer-daemon|notifications?|bounce|donotreply)/i;

export type WaitingKind = "flag" | "stale";

export type WaitingItem = {
  id: string;
  message: Message;
  kind: WaitingKind;
  reason: string;
  counterpart: string;
};

export function subjectRoot(subject: string): string {
  let value = readableText(subject).trim();
  for (let i = 0; i < 8; i += 1) {
    const next = value.replace(SUBJECT_PREFIX, "").trim();
    if (next === value) break;
    value = next;
  }
  return value.toLowerCase();
}

export function emailsIn(value: string): string[] {
  const found = value.match(EMAIL) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const email = raw.toLowerCase();
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

function isNoReply(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return NOREPLY.test(local);
}

function counterparts(message: Message, own: Set<string>): string[] {
  const source = message.toEmail || (message.folder === "sent" ? message.preview : "");
  return emailsIn(source).filter((email) => !own.has(email) && !isNoReply(email));
}

function hasReply(sent: Message, inbound: Message[], tos: string[]): boolean {
  const root = subjectRoot(sent.subject);
  const sentAt = Date.parse(sent.receivedAt);
  const rfc = (sent.rfcId ?? "").toLowerCase();
  return inbound.some((incoming) => {
    const from = incoming.fromEmail.toLowerCase();
    if (!tos.includes(from)) return false;
    const when = Date.parse(incoming.receivedAt);
    if (!Number.isFinite(when) || (Number.isFinite(sentAt) && when <= sentAt)) {
      return false;
    }
    const replyTo = (incoming.inReplyTo ?? "").toLowerCase();
    if (rfc && replyTo.includes(rfc)) return true;
    return subjectRoot(incoming.subject) === root;
  });
}

export function waitingItems(
  messages: Message[],
  dismissed: Set<string>,
  accountEmails: Set<string>,
  now = Date.now(),
): WaitingItem[] {
  const flagged: WaitingItem[] = messages
    .filter(
      (message) =>
        message.flagged && message.folder !== "junk" && !dismissed.has(message.id),
    )
    .map((message) => ({
      id: message.id,
      message,
      kind: "flag" as const,
      reason: "Flagged to chase",
      counterpart:
        message.folder === "sent"
          ? counterparts(message, accountEmails)[0] || message.toEmail || message.fromEmail
          : message.fromEmail,
    }));

  const inbound = messages.filter((message) => message.folder === "inbox");
  const stale: WaitingItem[] = [];
  for (const message of messages) {
    if (message.folder !== "sent") continue;
    if (dismissed.has(message.id) || message.flagged) continue;
    const at = Date.parse(message.receivedAt);
    if (!Number.isFinite(at) || now - at < WAIT_MS) continue;
    const tos = counterparts(message, accountEmails);
    if (tos.length === 0 || tos.length > 4) continue;
    if (hasReply(message, inbound, tos)) continue;
    stale.push({
      id: message.id,
      message,
      kind: "stale",
      reason: "Sent · no reply in 4 days",
      counterpart: tos[0],
    });
  }

  return [...flagged, ...stale].sort(
    (a, b) => Date.parse(b.message.receivedAt) - Date.parse(a.message.receivedAt),
  );
}

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function loadWaitingDismissed(): Set<string> {
  return new Set(readDismissed());
}

export function saveWaitingDismissed(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}
