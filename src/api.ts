import { invoke } from "@tauri-apps/api/core";
import type {
  AccountDraft,
  DraftAttachment,
  FlagChange,
  InlinePart,
  Mailbox,
  OAuthStatus,
  SendDraft,
  ServerGuess,
  StaffBrief,
  StaffDraft,
  StaffHire,
  StaffLetter,
  StaffStatus,
  StaffSummary,
  StaffTriage,
  StoryOverride,
  Clipping,
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

export function hydrateMailbox(
  mailbox: Mailbox,
  accountId: string | null,
): Mailbox {
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, accountId);
}

export function isTauri(): boolean {
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

export async function addAccountOAuth(
  draft: AccountDraft,
  provider: "google" | "microsoft",
): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Sign in needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("add_account_oauth", { draft, provider });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function oauthStatus(): Promise<OAuthStatus> {
  if (!isTauri()) {
    return { google: false, microsoft: false, googleClientId: "", microsoftClientId: "" };
  }
  return invoke<OAuthStatus>("oauth_status");
}

export async function saveOAuthClients(
  google: string,
  microsoft: string,
): Promise<OAuthStatus> {
  if (!isTauri()) {
    throw new Error("OAuth client IDs need the desktop app.");
  }
  return invoke<OAuthStatus>("save_oauth_clients", { google, microsoft });
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

export async function saveMailDraft(draft: SendDraft): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Saving a draft needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("save_mail_draft", { draft });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, draft.accountId);
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

export async function loadComposeAttachments(messageId: string): Promise<DraftAttachment[]> {
  if (!isTauri()) return [];
  return invoke<DraftAttachment[]>("compose_attachments", { messageId });
}

export async function saveAttachment(id: string): Promise<string> {
  if (!isTauri()) {
    throw new Error("Save needs the desktop app.");
  }
  return invoke<string>("save_attachment", { id });
}

export async function openInvite(messageId: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("Opening an invite needs the desktop app.");
  }
  await invoke("open_invite", { messageId });
}

export async function mailAlerts(): Promise<boolean> {
  if (!isTauri()) return true;
  return invoke<boolean>("mail_alerts");
}

export async function setMailAlerts(on: boolean): Promise<boolean> {
  if (!isTauri()) return on;
  return invoke<boolean>("set_mail_alerts", { on });
}

export async function moveToReading(messageId: string): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Classification needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("move_to_reading", { messageId });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function moveToAction(messageId: string): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Classification needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("move_to_action", { messageId });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function resetSender(email: string): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Classification needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("reset_sender", { email });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function lockSenderReading(email: string): Promise<Mailbox> {
  if (!isTauri()) {
    throw new Error("Classification needs the desktop app.");
  }
  const mailbox = await invoke<Mailbox>("lock_sender_reading", { email });
  return fromParts(mailbox.accounts, mailbox.messages, mailbox.folders, null);
}

export async function searchMail(query: string, accountId: string | null): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>("search_mail", { query, accountId });
}

export async function listClippings(): Promise<Clipping[]> {
  if (!isTauri()) return [];
  return invoke<Clipping[]>("list_clippings");
}

export async function saveClipping(messageId: string, quote: string): Promise<Clipping[]> {
  if (!isTauri()) {
    throw new Error("Clippings need the desktop app.");
  }
  return invoke<Clipping[]>("save_clipping", { messageId, quote });
}

export async function deleteClipping(id: string): Promise<Clipping[]> {
  if (!isTauri()) {
    throw new Error("Clippings need the desktop app.");
  }
  return invoke<Clipping[]>("delete_clipping", { id });
}

const EMPTY_STAFF: StaffStatus = {
  hired: false,
  provider: "openai",
  model: "",
  endpoint: "",
  summarize: false,
  summarizeAccount: false,
  summarizeNew: false,
  drafts: false,
  triage: false,
  triageNew: false,
  schedule: false,
};

export async function staffStatus(): Promise<StaffStatus> {
  if (!isTauri()) return EMPTY_STAFF;
  return invoke<StaffStatus>("staff_status");
}

export async function saveStaff(hire: StaffHire): Promise<StaffStatus> {
  if (!isTauri()) {
    throw new Error("Hiring staff needs the desktop app.");
  }
  return invoke<StaffStatus>("save_staff", { hire });
}

export async function clearStaff(): Promise<StaffStatus> {
  if (!isTauri()) {
    throw new Error("Staff lives in the desktop app.");
  }
  return invoke<StaffStatus>("clear_staff");
}

export async function staffLetter(messageId: string): Promise<StaffLetter> {
  if (!isTauri()) return { summary: null, draft: null };
  return invoke<StaffLetter>("staff_letter", { messageId });
}

export async function summarizeMail(messageId: string): Promise<StaffSummary> {
  if (!isTauri()) {
    throw new Error("Summaries need the desktop app.");
  }
  return invoke<StaffSummary>("summarize_mail", { messageId });
}

export async function draftReply(messageId: string): Promise<StaffDraft> {
  if (!isTauri()) {
    throw new Error("Drafts need the desktop app.");
  }
  return invoke<StaffDraft>("draft_reply", { messageId });
}

export async function draftRsvp(messageId: string): Promise<StaffDraft> {
  if (!isTauri()) {
    throw new Error("RSVPs need the desktop app.");
  }
  return invoke<StaffDraft>("draft_rsvp", { messageId });
}

export async function triageMail(messageId: string): Promise<StaffTriage> {
  if (!isTauri()) {
    throw new Error("Triage needs the desktop app.");
  }
  return invoke<StaffTriage>("triage_mail", { messageId });
}

export async function staffBrief(accountId: string | null): Promise<StaffBrief | null> {
  if (!isTauri()) return null;
  return invoke<StaffBrief | null>("staff_brief", { accountId });
}

export async function summarizeAccount(accountId: string | null): Promise<StaffBrief> {
  if (!isTauri()) {
    throw new Error("The Brief needs the desktop app.");
  }
  return invoke<StaffBrief>("summarize_account", { accountId });
}

export async function storyOverrides(): Promise<Record<string, StoryOverride>> {
  if (!isTauri()) return {};
  return invoke<Record<string, StoryOverride>>("story_overrides");
}

export async function saveStoryOverrides(
  overrides: Record<string, StoryOverride>,
): Promise<Record<string, StoryOverride>> {
  if (!isTauri()) return overrides;
  return invoke<Record<string, StoryOverride>>("save_story_overrides", { overrides });
}
