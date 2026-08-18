export type Hero = {
  label: string;
  tone: string;
};

export type Account = {
  id: string;
  address: string;
  label: string;
  kind?: string;
  auth?: string;
  imapHost?: string | null;
  imapPort?: number | null;
};

export type Message = {
  id: string;
  accountId: string;
  feed: "action" | "reading" | "uncertain";
  fromName: string;
  fromEmail: string;
  subject: string;
  preview: string;
  body: string;
  htmlBody?: string | null;
  receivedAt: string;
  unread: boolean;
  waitingOn: boolean;
  flagged?: boolean;
  folder: string;
  hero: Hero | null;
  attachments?: Attachment[];
  category?: string | null;
  why?: string | null;
  toEmail?: string;
  ccEmail?: string;
  rfcId?: string | null;
  inReplyTo?: string | null;
  invite?: MeetingInvite | null;
};

export type MeetingInvite = {
  method: string;
  summary: string;
  when: string;
  startsAt?: string | null;
  location?: string | null;
  organizer?: string | null;
  cancelled?: boolean;
};

export type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string | null;
  inline?: boolean;
  stored?: boolean;
};

export type Mailbox = {
  accounts: Account[];
  messages: Message[];
  folders?: MailFolder[];
  waiting: number;
};

export type MailFolder = {
  accountId: string;
  canonical: string;
  imapName: string;
  label: string;
};

export type ServerGuess = {
  imapHost: string;
  imapPort: number;
  popHost: string;
  popPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
};

export type AccountDraft = {
  address: string;
  password: string;
  label: string;
  kind: "imap" | "pop";
  imapHost: string;
  imapPort: number;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  trustTls?: boolean;
  auth?: string;
};

export type OAuthStatus = {
  google: boolean;
  microsoft: boolean;
  googleClientId: string;
  microsoftClientId: string;
};

export type SendDraft = {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  confirm: boolean;
  html?: string | null;
  attachments?: DraftAttachment[];
  inReplyTo?: string | null;
  replaceId?: string | null;
};

export type DraftAttachment = {
  filename: string;
  contentType: string;
  data: string;
};

export type InlinePart = {
  contentId: string;
  contentType: string;
  data: string;
};

export type FlagChange = {
  accountId: string;
  messageId: string;
  seen?: boolean | null;
  flagged?: boolean | null;
};

export type FeedId =
  | "action"
  | "reading"
  | "uncertain"
  | "awaiting"
  | "radar"
  | "sent"
  | "drafts"
  | "junk"
  | `custom:${string}`;
export type ReaderMode = "magazine" | "raw";
export type SyncStatus = {
  accountId: string;
  state: "idle" | "syncing" | "watching" | "error" | string;
  at?: string | null;
  message?: string | null;
};

export type StaffProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "compatible";

export type StaffStatus = {
  hired: boolean;
  provider: StaffProvider;
  model: string;
  endpoint: string;
  summarize: boolean;
  summarizeAccount: boolean;
  summarizeNew: boolean;
  drafts: boolean;
  triage: boolean;
  triageNew: boolean;
  schedule: boolean;
};

export type StaffHire = {
  provider: StaffProvider;
  model: string;
  endpoint: string;
  key: string;
  summarize: boolean;
  summarizeAccount: boolean;
  summarizeNew: boolean;
  drafts: boolean;
  triage: boolean;
  triageNew: boolean;
  schedule: boolean;
};

export type StaffSummary = {
  blurb: string;
  keywords: string[];
};

export type StaffDraft = {
  body: string;
};

export type StaffTriage = {
  feed: "action" | "reading";
  category: string | null;
  why: string;
};

export type StaffLetter = {
  summary: StaffSummary | null;
  draft: string | null;
};

export type StaffBriefItem = {
  id: string;
  line: string;
};

export type StaffBrief = {
  blurb: string;
  items: StaffBriefItem[];
  at: string;
};

export type StoryOverride = {
  title?: string;
  pinned?: boolean;
  rejected?: boolean;
  mergeInto?: string | null;
};
