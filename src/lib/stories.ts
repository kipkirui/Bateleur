import { readableText } from "./emailHtml";
import { subjectRoot } from "./waiting";
import type { Message } from "../types";

export type Story = {
  id: string;
  title: string;
  messages: Message[];
};

function storyKey(message: Message): string {
  const root = subjectRoot(message.subject);
  if (root.length < 12 || root === "(no subject)") return `id:${message.id}`;
  return `${message.folder}:${root}`;
}

export function groupStories(messages: Message[]): Story[] {
  const buckets = new Map<string, Message[]>();
  const order: string[] = [];
  for (const message of messages) {
    const key = storyKey(message);
    const list = buckets.get(key);
    if (!list) {
      buckets.set(key, [message]);
      order.push(key);
    } else {
      list.push(message);
    }
  }
  return order.map((id) => {
    const list = buckets.get(id) ?? [];
    return {
      id,
      title: readableText(list[0]?.subject ?? ""),
      messages: list,
    };
  });
}

export function threadLetters(mailbox: Message[], message: Message): Message[] {
  const key = storyKey(message);
  return mailbox
    .filter((item) => storyKey(item) === key)
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
}
