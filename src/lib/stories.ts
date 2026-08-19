import { readableText } from "./emailHtml";
import { newestFirst } from "./magazine";
import { subjectRoot } from "./waiting";
import type { Message } from "../types";

export type StoryOverride = {
  title?: string;
  pinned?: boolean;
  rejected?: boolean;
  mergeInto?: string | null;
};

export type Story = {
  id: string;
  title: string;
  pinned: boolean;
  messages: Message[];
};

export function autoStoryKey(message: Message): string {
  const root = subjectRoot(message.subject);
  if (root.length < 12 || root === "(no subject)") return `id:${message.id}`;
  return `${message.folder}:${root}`;
}

function resolvedKey(
  autoKey: string,
  messageId: string,
  overrides: Record<string, StoryOverride>,
): string {
  if (overrides[autoKey]?.rejected) return `id:${messageId}`;
  let key = autoKey;
  const seen = new Set<string>();
  for (let i = 0; i < 8; i += 1) {
    if (seen.has(key)) break;
    seen.add(key);
    const next = overrides[key]?.mergeInto;
    if (!next || next === key) break;
    if (overrides[next]?.rejected) break;
    key = next;
  }
  if (overrides[key]?.rejected) return `id:${messageId}`;
  return key;
}

export type StoryDesk = {
  overrides: Record<string, StoryOverride>;
  filter: string | null;
  onFilter: (id: string | null) => void;
  onPin: (id: string, on: boolean) => void;
  onRename: (id: string, title: string) => void;
  onMerge: (id: string, into: string) => void;
  onReject: (id: string) => void;
};

export function groupStories(
  messages: Message[],
  overrides: Record<string, StoryOverride> = {},
): Story[] {
  const buckets = new Map<string, Message[]>();
  const order: string[] = [];
  for (const message of messages) {
    const key = resolvedKey(autoStoryKey(message), message.id, overrides);
    const list = buckets.get(key);
    if (!list) {
      buckets.set(key, [message]);
      order.push(key);
    } else {
      list.push(message);
    }
  }
  const stories = order.map((id) => {
    const list = newestFirst(buckets.get(id) ?? []);
    const named = overrides[id]?.title?.trim();
    return {
      id,
      title: named || readableText(list[0]?.subject ?? ""),
      pinned: Boolean(overrides[id]?.pinned),
      messages: list,
    };
  });
  stories.sort((a, b) => {
    const pin = Number(b.pinned) - Number(a.pinned);
    if (pin !== 0) return pin;
    return (b.messages[0]?.receivedAt ?? "").localeCompare(a.messages[0]?.receivedAt ?? "");
  });
  return stories;
}

export function railStories(stories: Story[]): Story[] {
  return stories.filter((story) => story.pinned || story.messages.length >= 3).slice(0, 8);
}

export function threadLetters(
  mailbox: Message[],
  message: Message,
  overrides: Record<string, StoryOverride> = {},
): Message[] {
  const stories = groupStories(mailbox, overrides);
  const story = stories.find((item) => item.messages.some((entry) => entry.id === message.id));
  const letters = story?.messages ?? [message];
  return [...letters].sort(
    (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt),
  );
}

export function patchOverride(
  overrides: Record<string, StoryOverride>,
  id: string,
  patch: StoryOverride,
): Record<string, StoryOverride> {
  const current = overrides[id] ?? {};
  const next: StoryOverride = { ...current, ...patch };
  if (next.mergeInto === "") next.mergeInto = null;
  const empty =
    !next.title &&
    !next.pinned &&
    !next.rejected &&
    !next.mergeInto;
  const out = { ...overrides };
  if (empty) delete out[id];
  else out[id] = next;
  return out;
}
