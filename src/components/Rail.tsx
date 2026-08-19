import wordmarkDay from "../assets/logo/vector/isolated-monochrome-black.svg";
import wordmarkNight from "../assets/logo/vector/isolated-monochrome-white.svg";
import type { Account, FeedId, MailFolder, ReaderMode } from "../types";
import { PAPER_STOCKS, paperInk, type PaperStock } from "../lib/paper";
import { Mark } from "./Mark";

type Props = {
  accounts: Account[];
  accountId: string | null;
  onAccount: (id: string | null) => void;
  feed: FeedId;
  onFeed: (feed: FeedId) => void;
  waiting: number;
  awaiting: number;
  uncertain: number;
  radar: number;
  clippings?: number;
  clippingsOpen?: boolean;
  onClippings?: () => void;
  folders: MailFolder[];
  mode: ReaderMode;
  onMode: (mode: ReaderMode) => void;
  onCompose: () => void;
  paper: PaperStock;
  onPaper: (stock: PaperStock) => void;
  sync: { label: string; hint: string } | null;
  stories?: { id: string; title: string; count: number }[];
  storyId?: string | null;
  onStory?: (id: string | null) => void;
};

const FEEDS: { id: FeedId; label: string }[] = [
  { id: "action", label: "Action" },
  { id: "reading", label: "Reading" },
  { id: "archive", label: "Back issues" },
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
  uncertain,
  radar,
  clippings = 0,
  clippingsOpen = false,
  onClippings,
  folders,
  mode,
  onMode,
  onCompose,
  paper,
  onPaper,
  sync,
  stories = [],
  storyId = null,
  onStory,
}: Props) {
  const customFolders = folders.filter(
    (folder) =>
      folder.canonical === "custom" &&
      (!accountId || folder.accountId === accountId),
  );
  const shownCustom =
    accountId === null
      ? customFolders.filter(
          (folder, index) =>
            customFolders.findIndex((other) => other.imapName === folder.imapName) ===
            index,
        )
      : customFolders;

  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-lockup">
          <Mark paper={paper} />
          <img
            className="brand-logo"
            src={paperInk(paper) === "light" ? wordmarkNight : wordmarkDay}
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
          {uncertain > 0 ? (
            <button
              type="button"
              className={feed === "uncertain" ? "await-badge active" : "await-badge"}
              onClick={() => onFeed(feed === "uncertain" ? "action" : "uncertain")}
            >
              <span className="await-count">{uncertain}</span>
              <span className="await-copy">
                <span className="await-label">Uncertain</span>
                <span className="rail-stat-hint">
                  A weak phrase matched. Put these on Action or Reading — the guess stays off the front page.
                </span>
              </span>
            </button>
          ) : null}
          {radar > 0 ? (
            <button
              type="button"
              className={feed === "radar" ? "await-badge active" : "await-badge"}
              onClick={() => onFeed(feed === "radar" ? "action" : "radar")}
            >
              <span className="await-count">{radar}</span>
              <span className="await-copy">
                <span className="await-label">Radar</span>
                <span className="rail-stat-hint">
                  Meeting invites already in this mailbox. Not a calendar.
                </span>
              </span>
            </button>
          ) : null}
          {clippings > 0 && onClippings ? (
            <button
              type="button"
              className={clippingsOpen ? "await-badge active" : "await-badge"}
              onClick={onClippings}
            >
              <span className="await-count">{clippings}</span>
              <span className="await-copy">
                <span className="await-label">Clippings</span>
                <span className="rail-stat-hint">
                  Quotes you kept from letters. Not a notebook.
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

      <div className="rail-scroll">
      <div className="rail-label">Accounts</div>
      <button
        type="button"
        className={accountId === null ? "nav active" : "nav"}
        onClick={() => onAccount(null)}
      >
        All mailboxes
        {accounts.length > 1 ? (
          <span className="nav-meta">
            {accounts.map((account) => account.label).join(" · ")}
          </span>
        ) : null}
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

      {stories.length > 0 && onStory ? (
        <>
          <div className="rail-label">Stories</div>
          {stories.map((story) => (
            <button
              key={story.id}
              type="button"
              className={storyId === story.id ? "nav active" : "nav"}
              onClick={() => onStory(storyId === story.id ? null : story.id)}
            >
              <span>{story.title}</span>
              <span className="nav-meta">
                {story.count === 1 ? "1 letter" : `${story.count} letters`}
              </span>
            </button>
          ))}
        </>
      ) : null}

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
      {shownCustom.map((folder) => {
          const id = `custom:${folder.imapName}` as FeedId;
          return (
            <button
              key={
                accountId === null
                  ? folder.imapName
                  : `${folder.accountId}:${folder.imapName}`
              }
              type="button"
              className={feed === id ? "nav active" : "nav"}
              onClick={() => onFeed(id)}
            >
              <span>{folder.label}</span>
              <span className="nav-meta">{folder.imapName}</span>
            </button>
          );
        })}
      </div>

      <div className="rail-dock">
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

      <div className="paper-switch">
        {PAPER_STOCKS.map((stock) => (
          <button
            key={stock.id}
            type="button"
            className={paper === stock.id ? "active" : ""}
            onClick={() => onPaper(stock.id)}
          >
            {stock.label}
          </button>
        ))}
      </div>
      </div>
    </aside>
  );
}
