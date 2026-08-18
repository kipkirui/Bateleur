import wordmarkDay from "../assets/logo/vector/isolated-monochrome-black.svg";
import wordmarkNight from "../assets/logo/vector/isolated-monochrome-white.svg";
import type { Account, FeedId, MailFolder, ReaderMode } from "../types";
import { Mark } from "./Mark";

type Props = {
  accounts: Account[];
  accountId: string | null;
  onAccount: (id: string | null) => void;
  feed: FeedId;
  onFeed: (feed: FeedId) => void;
  waiting: number;
  awaiting: number;
  folders: MailFolder[];
  mode: ReaderMode;
  onMode: (mode: ReaderMode) => void;
  onCompose: () => void;
  onSettings: () => void;
  theme: "day" | "night";
  onTheme: () => void;
  sync: { label: string; hint: string } | null;
};

const FEEDS: { id: FeedId; label: string }[] = [
  { id: "action", label: "Action" },
  { id: "reading", label: "Reading" },
];

const SYSTEM_FOLDERS: { id: FeedId; label: string }[] = [
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  { id: "junk", label: "Junk" },
];

export function Rail({
  accounts,
  accountId,
  onAccount,
  feed,
  onFeed,
  waiting,
  awaiting,
  folders,
  mode,
  onMode,
  onCompose,
  onSettings,
  theme,
  onTheme,
  sync,
}: Props) {
  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-lockup">
          <Mark theme={theme} />
          <img
            className="brand-logo"
            src={theme === "night" ? wordmarkNight : wordmarkDay}
            alt="Bateleur"
            draggable={false}
          />
        </div>
        <div className="rail-status">
          <div className="rail-stat">
            <div className="waiting">
              {waiting === 0 ? "0 need you" : `${waiting} need you`}
            </div>
            <p className="rail-stat-hint">
              {waiting === 0
                ? "Action is clear. Nothing in that pile is unread."
                : "Unread Action — invoices, codes, please-reply. Your turn."}
            </p>
          </div>
          {awaiting > 0 ? (
            <button
              type="button"
              className={feed === "awaiting" ? "await-badge active" : "await-badge"}
              onClick={() => onFeed(feed === "awaiting" ? "action" : "awaiting")}
            >
              <span className="await-count">{awaiting}</span>
              <span className="await-copy">
                <span className="await-label">Awaiting a reply</span>
                <span className="rail-stat-hint">
                  Their turn. Flagged to chase, or sent with no answer in four days.
                </span>
              </span>
            </button>
          ) : null}
          {sync ? (
            <div className="rail-stat">
              <div className="sync-status">{sync.label}</div>
              <p className="rail-stat-hint">{sync.hint}</p>
            </div>
          ) : null}
        </div>
      </div>

      <button className="compose" type="button" onClick={onCompose}>
        Compose
        <kbd>N</kbd>
      </button>

      <div className="rail-label">Accounts</div>
      <button
        type="button"
        className={accountId === null ? "nav active" : "nav"}
        onClick={() => onAccount(null)}
      >
        All mailboxes
      </button>
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          className={accountId === account.id ? "nav active" : "nav"}
          onClick={() => onAccount(account.id)}
        >
          <span>{account.label}</span>
          <span className="nav-meta">
            {account.kind === "pop" ? "POP" : "IMAP"}
            {account.auth === "xoauth2" ? " · OAuth" : ""} · {account.address}
          </span>
        </button>
      ))}

      <div className="rail-label">Feeds</div>
      {FEEDS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={feed === item.id ? "nav active" : "nav"}
          onClick={() => onFeed(item.id)}
        >
          {item.label}
        </button>
      ))}

      <div className="rail-label">Folders</div>
      {SYSTEM_FOLDERS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={feed === item.id ? "nav active" : "nav"}
          onClick={() => onFeed(item.id)}
        >
          {item.label}
        </button>
      ))}
      {folders
        .filter(
          (folder) =>
            folder.canonical === "custom" &&
            (!accountId || folder.accountId === accountId),
        )
        .map((folder) => {
          const id = `custom:${folder.imapName}` as FeedId;
          return (
            <button
              key={`${folder.accountId}:${folder.imapName}`}
              type="button"
              className={feed === id ? "nav active" : "nav"}
              onClick={() => onFeed(id)}
            >
              <span>{folder.label}</span>
              <span className="nav-meta">{folder.imapName}</span>
            </button>
          );
        })}

      <div className="rail-spacer" />

      <div className="rail-label">View</div>
      <div className="mode-switch">
        <button
          type="button"
          className={mode === "magazine" ? "active" : ""}
          onClick={() => onMode("magazine")}
        >
          Magazine
        </button>
        <button
          type="button"
          className={mode === "raw" ? "active" : ""}
          onClick={() => onMode("raw")}
        >
          Raw
        </button>
      </div>

      <button type="button" className="nav" onClick={onTheme}>
        {theme === "day" ? "Night paper" : "Day paper"}
      </button>
      <button type="button" className="nav" onClick={onSettings}>
        Settings
      </button>
    </aside>
  );
}
