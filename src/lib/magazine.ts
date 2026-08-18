import { readableText } from "./emailHtml";
import type { Message } from "../types";

const JUNK =
  /view in (browser|app)|unsubscribe|manage (your )?preferences|if you cannot see|having trouble viewing|open in (the )?app|this email was sent|privacy policy|click here to|add us to your (address|contacts)/i;

export function initials(name: string, email: string): string {
  const source = readableText(name).trim() || email.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function avatarHue(email: string): number {
  let hash = 0;
  for (const ch of email.toLowerCase()) {
    hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  }
  return hash % 360;
}

export function lede(message: Message): string {
  const subject = readableText(message.subject).trim();
  const blob = readableText(message.body || message.preview);
  for (const raw of splitSentences(blob)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 28) continue;
    if (JUNK.test(line)) continue;
    if (line.toLowerCase() === subject.toLowerCase()) continue;
    if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+$/i.test(line)) continue;
    return clip(line, 180);
  }
  const preview = readableText(message.preview).trim();
  return clip(preview || subject, 180);
}

export function readingTime(message: Message): string {
  const text = readableText(message.body || message.preview);
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return minutes === 1 ? "1 min read" : `${minutes} min read`;
}

export function sendFrequency(messages: Message[], email: string): string {
  const from = messages
    .filter((m) => m.fromEmail.toLowerCase() === email.toLowerCase())
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  if (from.length <= 1) return "new sender";
  const first = Date.parse(from[0].receivedAt);
  const last = Date.parse(from[from.length - 1].receivedAt);
  const days = Math.max(1, (last - first) / 86_400_000);
  const perMonth = from.length / Math.max(days / 30, 1 / 30);
  if (perMonth < 0.5) return "emails you ~1×/quarter";
  if (perMonth < 2) return "emails you ~1×/month";
  if (perMonth < 6) return "emails you ~1×/week";
  return "emails you often";
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

export function issueLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function groupIssues(messages: Message[]): { id: string; title: string; messages: Message[] }[] {
  const buckets = new Map<string, Message[]>();
  for (const message of messages) {
    const key = message.receivedAt.slice(0, 7) || "undated";
    const list = buckets.get(key);
    if (list) list.push(message);
    else buckets.set(key, [message]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([id, list]) => ({
      id,
      title: issueLabel(list[0]?.receivedAt ?? id),
      messages: list,
    }));
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
