const RECEIPT_KEY = "bateleur.receipt";
const SHOWN_KEY = "bateleur.receiptShown";

export type Receipt = {
  day: string;
  archived: number;
  flagged: number;
  unread: number;
  sent: number;
  reading: number;
};

export type ReceiptField = Exclude<keyof Receipt, "day">;

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function empty(day = today()): Receipt {
  return { day, archived: 0, flagged: 0, unread: 0, sent: 0, reading: 0 };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadReceipt(): Receipt {
  const stored = readJson<Receipt>(RECEIPT_KEY);
  const day = today();
  if (!stored || stored.day !== day) return empty(day);
  return { ...empty(day), ...stored, day };
}

export function bumpReceipt(field: ReceiptField, delta = 1): Receipt {
  const next = loadReceipt();
  next[field] = Math.max(0, next[field] + delta);
  writeJson(RECEIPT_KEY, next);
  return next;
}

export function receiptHasWork(receipt: Receipt = loadReceipt()): boolean {
  return (
    receipt.archived + receipt.flagged + receipt.unread + receipt.sent + receipt.reading >
    0
  );
}

function part(count: number, one: string, many: string): string | null {
  if (count <= 0) return null;
  return count === 1 ? one : many.replace("{n}", String(count));
}

export function formatReceipt(receipt: Receipt = loadReceipt()): string | null {
  const parts = [
    part(receipt.archived, "archived 1", "archived {n}"),
    part(receipt.flagged, "flagged 1", "flagged {n}"),
    part(receipt.sent, "sent 1", "sent {n}"),
    part(receipt.reading, "moved 1 to Reading", "moved {n} to Reading"),
    part(receipt.unread, "marked 1 unread", "marked {n} unread"),
  ].filter((item): item is string => Boolean(item));
  if (parts.length === 0) return null;
  if (parts.length === 1) return `You ${parts[0]} today.`;
  const last = parts.pop() as string;
  return `You ${parts.join(", ")}, and ${last} today.`;
}

export function loadReceiptShownToday(): boolean {
  return readJson<string>(SHOWN_KEY) === today();
}

export function saveReceiptShownToday() {
  writeJson(SHOWN_KEY, today());
}
