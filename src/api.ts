import { invoke } from "@tauri-apps/api/core";
import type {
  AccountDraft,
  FlagChange,
  InlinePart,
  Mailbox,
  SendDraft,
  ServerGuess,
} from "./types";

function fromParts(
  accounts: Mailbox["accounts"],
  messages: Mailbox["messages"],
  folders: Mailbox["folders"],
  accountId: string | null,
): Mailbox {
  const waiting = messages.filter((m) => {
    if (m.feed !== "action" || m.folder !== "inbox") return false;
    if (accountId && m.accountId !== accountId) return false;
    return m.unread || m.waitingOn;
  }).length;
  return { accounts, messages, folders: folders ?? [], waiting };
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadMailbox(accountId: string | null): Promise<Mailbox> {
  if (!isTauri()) {
    return fromParts([], [], [], accountId);
  }
  const mailbox = await invoke<Mailbox>("mailbox");
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, accountId);
}

export async function guessServers(address: string): Promise<ServerGuess | null> {
  if (!isTauri()) return null;
  return invoke<ServerGuess | null>("guess_account_servers", { address });
}

export async function addAccount(draft: AccountDraft): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Add account needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("add_account", { draft });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function syncAccount(accountId: string): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Sync needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("sync_account", { accountId });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, accountId);
}

export async function removeAccount(accountId: string): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Disconnect needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("remove_account", { accountId });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function sendMail(draft: SendDraft): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Send needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("send_mail", { draft });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, draft.accountId);
}

export async function setFlag(change: FlagChange): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Flags need the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("set_flag", { change });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, change.accountId);
}

export async function archiveMessage(
  accountId: string,
  messageId: string,
): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Archive needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("archive_message", { accountId, messageId });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, accountId);
}

export async function loadInlineParts(messageId: string): Promise<InlinePart[]> {
  if (!isTauri()) return [];
  return invoke<InlinePart[]>("inline_parts", { messageId });
}

export async function saveAttachment(id: string): Promise<string> {
  if (!isTauri()) {
    throw new Error("Save needs the desktop app.");
  }
  return invoke<string>("save_attachment", { id });
}
