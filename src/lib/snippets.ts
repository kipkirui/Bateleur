export type Snippet = {
  id: string;
  trigger: string;
  body: string;
};

const KEY = "bateleur.snippets";

const DEFAULTS: Snippet[] = [
  { id: "thanks", trigger: "thanks", body: "Thanks for reaching out," },
  { id: "followup", trigger: "followup", body: "Following up on this," },
  { id: "gotit", trigger: "gotit", body: "Got this — I will look and reply." },
];

const TRIGGER = /^[a-z][a-z0-9_-]{0,24}$/;

function read(): Snippet[] | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as { id?: unknown; trigger?: unknown; body?: unknown };
        if (typeof item.trigger !== "string" || typeof item.body !== "string") {
          return null;
        }
        const trigger = item.trigger.trim().toLowerCase();
        if (!TRIGGER.test(trigger) || !item.body.trim()) return null;
        return {
          id: typeof item.id === "string" ? item.id : trigger,
          trigger,
          body: item.body,
        };
      })
      .filter((row): row is Snippet => Boolean(row));
  } catch {
    return null;
  }
}

export function loadSnippets(): Snippet[] {
  const stored = read();
  if (stored === null) return DEFAULTS.map((row) => ({ ...row }));
  return stored;
}

export function saveSnippets(rows: Snippet[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

export function normalizeTrigger(value: string): string | null {
  const trigger = value.trim().toLowerCase().replace(/^[:/]+/, "");
  return TRIGGER.test(trigger) ? trigger : null;
}

export function parseTrigger(beforeCaret: string): { raw: string; token: string } | null {
  const match = beforeCaret.match(/(?:^|\s)(::|\/)([a-z][a-z0-9_-]{0,24})$/i);
  if (!match) return null;
  return { raw: `${match[1]}${match[2]}`, token: match[2].toLowerCase() };
}

export function matchSnippets(token: string, rows: Snippet[]): Snippet[] {
  if (!token) return rows.slice(0, 6);
  return rows.filter((row) => row.trigger.startsWith(token)).slice(0, 6);
}
