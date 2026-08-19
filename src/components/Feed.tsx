import { useState, type MouseEvent } from "react";
import { readableText } from "../lib/emailHtml";
import { formatWhen, lede, groupIssues } from "../lib/magazine";
import { groupStories, type Story, type StoryDesk } from "../lib/stories";
import { StoryTools } from "./StoryTools";
import type { WaitingItem } from "../lib/waiting";
import { Avatar } from "./Avatar";
import { MorningBrief } from "./MorningBrief";
import type { FeedId, Message, ReaderMode, StaffBrief } from "../types";

type Props = {
  onPalette: () => void;
  mode: ReaderMode;
  feed: FeedId;
  messages: Message[];
  digest: Message[];
  selectedId: string | null;
  checkedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onArchive: (message: Message) => void;
  onReply: (message: Message) => void;
  onReading: (message: Message) => void;
  onAction: (message: Message) => void;
  onSender: (message: Message) => void;
  onBulkArchive: () => void;
  onBulkFlag: () => void;
  onClearChecked: () => void;
  emptyLabel: string;
  combinedFrom?: string | null;
  mailboxOf?: (accountId: string) => string | undefined;
  receiptLine?: string | null;
  awaiting?: WaitingItem[];
  onDismissAwaiting?: (id: string) => void;
  brief?: StaffBrief | null;
  briefBusy?: boolean;
  briefError?: string | null;
  showBrief?: boolean;
  onWriteBrief?: () => void;
  stories?: StoryDesk;
};

export function Feed({
  onPalette,
  mode,
  feed,
  messages,
  digest,
  selectedId,
  checkedIds,
  onSelect,
  onToggleCheck,
  onOpen,
  onArchive,
  onReply,
  onReading,
  onAction,
  onSender,
  onBulkArchive,
  onBulkFlag,
  onClearChecked,
  emptyLabel,
  combinedFrom = null,
  mailboxOf,
  receiptLine,
  awaiting = [],
  onDismissAwaiting,
  brief = null,
  briefBusy = false,
  briefError = null,
  showBrief = false,
  onWriteBrief,
  stories: storyDesk,
}: Props) {
  const checked = checkedIds.size;
  const selecting = checked > 0;
  const actionEmpty = feed === "action" && messages.length === 0;
  const overrides = storyDesk?.overrides ?? {};
  const grouped = groupStories(messages, overrides);
  const filterStory = storyDesk?.filter
    ? grouped.find((item) => item.id === storyDesk.filter) ?? grouped[0]
    : null;
  const tools = filterStory ? undefined : storyDesk;

  return (
    <section className="center">
      <button type="button" className="command" onClick={onPalette}>
        <span>Search mail or jump</span>
        <span className="command-hint">Ctrl+K</span>
      </button>

      {checked > 0 ? (
        <div className="bulk-bar">
          <span>
            {checked} selected · <kbd>x</kbd> toggle · <kbd>e</kbd> archive · <kbd>s</kbd> flag
          </span>
          <span className="card-actions">
            <button type="button" className="text-btn" onClick={onBulkArchive}>
              Archive
            </button>
            <button type="button" className="text-btn" onClick={onBulkFlag}>
              Flag
            </button>
            <button type="button" className="text-btn" onClick={onClearChecked}>
              Clear
            </button>
          </span>
        </div>
      ) : null}

      {showBrief && feed === "action" && onWriteBrief ? (
        <MorningBrief
          brief={brief}
          busy={briefBusy}
          error={briefError}
          onWrite={onWriteBrief}
          onOpen={onOpen}
        />
      ) : null}

      {filterStory && storyDesk ? (
        <div className="story-banner">
          <StoryTools
            story={filterStory}
            others={grouped}
            onPin={storyDesk.onPin}
            onRename={storyDesk.onRename}
            onMerge={storyDesk.onMerge}
            onReject={storyDesk.onReject}
          />
          <button type="button" className="text-btn" onClick={() => storyDesk.onFilter(null)}>
            All mail
          </button>
        </div>
      ) : null}

      <div className="feed-scroll">
        {combinedFrom ? (
          <p className="feed-masthead">All mailboxes · {combinedFrom}</p>
        ) : null}
        {actionEmpty ? (
          <div className="empty empty-clear">
            <p>{emptyLabel}</p>
            <p className="muted">
              {receiptLine ?? "Action is clear. Reading is still there when you want it."}
            </p>
          </div>
        ) : feed === "radar" ? (
          messages.length === 0 ? (
            <div className="empty">{emptyLabel}</div>
          ) : (
            <div className="magazine">
              <div className="block">
                <h2>Radar</h2>
                <p className="muted await-lede">
                  Meeting invites that already arrived as mail. There is no calendar behind this list.
                </p>
                <ul className="await-list">
                  {messages.map((message) => (
                    <li key={message.id}>
                      <button
                        type="button"
                        className={`await-row${selectedId === message.id ? " selected" : ""}`}
                        onClick={() => onSelect(message.id)}
                        onDoubleClick={() => onOpen(message.id)}
                      >
                        <span className="await-who">
                          {message.invite?.when ?? readableText(message.fromName)}
                        </span>
                        <span className="await-why">
                          {message.invite?.summary ?? readableText(message.subject)}
                        </span>
                        <span className="await-subject">
                          {message.invite?.location || readableText(message.fromName) || message.fromEmail}
                          <MailboxMark name={mailboxOf?.(message.accountId)} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        ) : feed === "awaiting" ? (
          awaiting.length === 0 ? (
            <div className="empty">{emptyLabel}</div>
          ) : (
            <div className="magazine">
              <div className="block">
                <h2>Awaiting reply</h2>
                <p className="muted await-lede">
                  These are open loops — you are waiting on someone else, not the other way around.
                </p>
                <ul className="await-list">
                  {awaiting.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`await-row${selectedId === item.id ? " selected" : ""}`}
                        onClick={() => onSelect(item.id)}
                        onDoubleClick={() => onOpen(item.id)}
                      >
                        <span className="await-who">
                          {readableText(item.counterpart) || "Someone"}
                        </span>
                        <span className="await-why">{item.reason}</span>
                        <span className="await-subject">
                          {readableText(item.message.subject)}
                          <MailboxMark name={mailboxOf?.(item.message.accountId)} />
                        </span>
                      </button>
                      {item.kind === "stale" && onDismissAwaiting ? (
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => onDismissAwaiting(item.id)}
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        ) : feed === "uncertain" ? (
          messages.length === 0 ? (
            <div className="empty">{emptyLabel}</div>
          ) : (
            <div className="magazine">
              <div className="block">
                <h2>Uncertain</h2>
                <p className="muted await-lede">
                  A weak phrase matched. These stay off Action until you put them on Action or Reading.
                </p>
                <ul className="await-list">
                  {messages.map((message) => (
                    <li key={message.id}>
                      <button
                        type="button"
                        className={`await-row${selectedId === message.id ? " selected" : ""}`}
                        onClick={() => onSelect(message.id)}
                        onDoubleClick={() => onOpen(message.id)}
                      >
                        <span className="await-who">
                          {readableText(message.fromName) || message.fromEmail}
                        </span>
                        <span className="await-why">
                          {message.why ?? "Too thin to guess Action or Reading."}
                        </span>
                        <span className="await-subject">
                          {readableText(message.subject)}
                          <MailboxMark name={mailboxOf?.(message.accountId)} />
                        </span>
                      </button>
                      <span className="card-actions">
                        <button type="button" className="text-btn" onClick={() => onAction(message)}>
                          Action
                        </button>
                        <button type="button" className="text-btn" onClick={() => onReading(message)}>
                          Reading
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        ) : messages.length === 0 ? (
          <div className="empty">{emptyLabel}</div>
        ) : mode === "raw" ? (
          <ul className="raw-list">
            {messages.map((message) => (
              <li key={message.id}>
                <div
                  className={`raw-row${selectedId === message.id ? " selected" : ""}${checkedIds.has(message.id) ? " checked" : ""}`}
                  onClick={() => onSelect(message.id)}
                  onDoubleClick={() => onOpen(message.id)}
                >
                  <Check
                    on={checkedIds.has(message.id)}
                    onToggle={() => onToggleCheck(message.id)}
                  />
                  <span className={message.unread ? "dot unread" : "dot"} />
                  <span className="raw-from">
                    {readableText(message.fromName)}
                    {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
                    <MailboxMark name={mailboxOf?.(message.accountId)} />
                  </span>
                  <span className="raw-subject">{readableText(message.subject)}</span>
                  <span className="raw-preview">{readableText(message.preview)}</span>
                  <span className="raw-when">{formatWhen(message.receivedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : feed === "action" ? (
          <ActionMagazine
            messages={messages}
            digest={digest}
            selectedId={selectedId}
            checkedIds={checkedIds}
            selecting={selecting}
            onSelect={onSelect}
            onToggleCheck={onToggleCheck}
            onOpen={onOpen}
            onArchive={onArchive}
            onReply={onReply}
            onReading={onReading}
            onSender={onSender}
            storyDesk={tools}
            mailboxOf={mailboxOf}
          />
        ) : feed === "archive" ? (
          <BackIssues
            messages={messages}
            selectedId={selectedId}
            checkedIds={checkedIds}
            selecting={selecting}
            onSelect={onSelect}
            onToggleCheck={onToggleCheck}
            onOpen={onOpen}
            onSender={onSender}
            mailboxOf={mailboxOf}
          />
        ) : (
          <div className="magazine">
            <div className="block">
              <h2>{feedHeading(feed)}</h2>
              {grouped.map((story) => (
                <StoryTeasers
                  key={story.id}
                  story={story}
                  others={grouped}
                  selectedId={selectedId}
                  checkedIds={checkedIds}
                  selecting={selecting}
                  onSelect={onSelect}
                  onToggleCheck={onToggleCheck}
                  onOpen={onOpen}
                  onSender={onSender}
                  storyDesk={tools}
                  mailboxOf={mailboxOf}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ActionMagazine({
  messages,
  digest,
  selectedId,
  checkedIds,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  onArchive,
  onReply,
  onReading,
  onSender,
  storyDesk,
  mailboxOf,
}: {
  messages: Message[];
  digest: Message[];
  selectedId: string | null;
  checkedIds: Set<string>;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onArchive: (message: Message) => void;
  onReply: (message: Message) => void;
  onReading: (message: Message) => void;
  onSender: (message: Message) => void;
  storyDesk?: StoryDesk;
  mailboxOf?: (accountId: string) => string | undefined;
}) {
  const stories = groupStories(messages, storyDesk?.overrides);
  const digestStories = groupStories(digest, storyDesk?.overrides);
  const [cover, ...rest] = stories;
  const lead = cover?.messages[0];
  return (
    <div className="magazine">
      {lead ? (
        <div className="block">
          <h2>Cover</h2>
          {storyDesk ? <StoryKicker story={cover} others={stories} desk={storyDesk} /> : null}
          <Cover
            message={lead}
            thread={cover.messages.length}
            selected={selectedId === lead.id}
            checked={checkedIds.has(lead.id)}
            selecting={selecting}
            onSelect={onSelect}
            onToggleCheck={onToggleCheck}
            onOpen={onOpen}
            onArchive={onArchive}
            onReply={onReply}
            onReading={onReading}
            onSender={onSender}
            mailbox={mailboxOf?.(lead.accountId)}
          />
          {cover.messages.slice(1).map((message) => (
            <BriefRow
              key={message.id}
              message={message}
              selected={selectedId === message.id}
              checked={checkedIds.has(message.id)}
              selecting={selecting}
              onSelect={onSelect}
              onToggleCheck={onToggleCheck}
              onOpen={onOpen}
              mailbox={mailboxOf?.(message.accountId)}
            />
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div className="block briefing">
          <h2>Briefing</h2>
          {rest.map((story) => (
            <div key={story.id} className={story.messages.length > 1 || story.pinned ? "story-stack" : undefined}>
              <StoryKicker story={story} others={stories} desk={storyDesk} />
              {story.messages.map((message) => (
                <BriefRow
                  key={message.id}
                  message={message}
                  selected={selectedId === message.id}
                  checked={checkedIds.has(message.id)}
                  selecting={selecting}
                  onSelect={onSelect}
                  onToggleCheck={onToggleCheck}
                  onOpen={onOpen}
                  mailbox={mailboxOf?.(message.accountId)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {digest.length > 0 ? (
        <div className="block">
          <h2>Reading</h2>
          {digestStories.map((story) => (
            <StoryTeasers
              key={story.id}
              story={story}
              others={digestStories}
              selectedId={selectedId}
              checkedIds={checkedIds}
              selecting={selecting}
              onSelect={onSelect}
              onToggleCheck={onToggleCheck}
              onOpen={onOpen}
              onSender={onSender}
              storyDesk={storyDesk}
              mailboxOf={mailboxOf}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BackIssues({
  messages,
  selectedId,
  checkedIds,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  onSender,
  mailboxOf,
}: {
  messages: Message[];
  selectedId: string | null;
  checkedIds: Set<string>;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onSender: (message: Message) => void;
  mailboxOf?: (accountId: string) => string | undefined;
}) {
  const issues = groupIssues(messages);
  return (
    <div className="magazine">
      <div className="block">
        <h2>Back issues</h2>
        <p className="muted await-lede">
          Letters you archived, bound by month. Not a folder tree.
        </p>
        {issues.map((issue) => (
          <div key={issue.id} className="issue">
            <h3 className="issue-month">{issue.title}</h3>
            {issue.messages.map((message) => (
              <article
                key={message.id}
                className={`issue-row${selectedId === message.id ? " selected" : ""}${checkedIds.has(message.id) ? " checked" : ""}`}
                onClick={() => onSelect(message.id)}
                onDoubleClick={() => onOpen(message.id)}
              >
                {selecting || checkedIds.has(message.id) ? (
                  <Check on={checkedIds.has(message.id)} onToggle={() => onToggleCheck(message.id)} />
                ) : (
                  <span className={message.unread ? "dot unread" : "dot"} />
                )}
                <div className="issue-copy">
                  <h4 className="issue-hed">{readableText(message.subject)}</h4>
                  <button
                    type="button"
                    className="sender-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSender(message);
                    }}
                  >
                    {readableText(message.fromName) || message.fromEmail}
                    <MailboxMark name={mailboxOf?.(message.accountId)} />
                  </button>
                </div>
                <span className="issue-when">{formatWhen(message.receivedAt)}</span>
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Cover({
  message,
  thread,
  selected,
  checked,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  onArchive,
  onReply,
  onReading,
  onSender,
  mailbox,
}: {
  message: Message;
  thread: number;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onArchive: (message: Message) => void;
  onReply: (message: Message) => void;
  onReading: (message: Message) => void;
  onSender: (message: Message) => void;
  mailbox?: string;
}) {
  const [why, setWhy] = useState(false);

  function stop(event: MouseEvent, fn: () => void) {
    event.stopPropagation();
    fn();
  }

  const kicker = [
    mailbox,
    thread > 1 ? `Developing · ${thread} letters` : null,
    message.category,
    message.hero?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`cover${selected ? " selected" : ""}${checked ? " checked" : ""}`}
      onClick={() => onSelect(message.id)}
      onDoubleClick={() => onOpen(message.id)}
    >
      <div className="cover-kicker">
        {selecting || checked ? (
          <Check on={checked} onToggle={() => onToggleCheck(message.id)} />
        ) : null}
        <span>{kicker || "Action"}</span>
        <span>{formatWhen(message.receivedAt)}</span>
      </div>
      <h3 className="cover-hed">{readableText(message.subject)}</h3>
      <blockquote className="cover-lede">{lede(message)}</blockquote>
      <button type="button" className="sender-btn cover-byline" onClick={(e) => stop(e, () => onSender(message))}>
        <Avatar name={message.fromName} email={message.fromEmail} size="md" />
        <span>
          <strong>
            {readableText(message.fromName)}
            {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
          </strong>
          <span className="card-when">{message.fromEmail}</span>
        </span>
      </button>
      {fileCount(message) ? <div className="file-count">{fileLabel(fileCount(message))}</div> : null}
      {why && message.why ? <p className="why-copy">{message.why}</p> : null}
      <div className="card-actions">
        <button type="button" className="text-btn" onClick={(e) => stop(e, () => onArchive(message))}>
          Archive
        </button>
        <button type="button" className="text-btn" onClick={(e) => stop(e, () => onReply(message))}>
          Reply
        </button>
        <button type="button" className="text-btn" onClick={(e) => stop(e, () => onReading(message))}>
          Reading
        </button>
        {message.why ? (
          <button type="button" className="text-btn why-btn" onClick={(e) => stop(e, () => setWhy((v) => !v))}>
            {why ? "Hide" : "Why here?"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function BriefRow({
  message,
  selected,
  checked,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  mailbox,
}: {
  message: Message;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  mailbox?: string;
}) {
  return (
    <div
      className={`brief-row${selected ? " selected" : ""}${checked ? " checked" : ""}`}
      onClick={() => onSelect(message.id)}
      onDoubleClick={() => onOpen(message.id)}
    >
      {selecting || checked ? (
        <Check on={checked} onToggle={() => onToggleCheck(message.id)} />
      ) : (
        <span className={message.unread ? "dot unread" : "dot"} />
      )}
      <span className="brief-hed">
        {message.category ? <span className="badge">{message.category}</span> : null}
        <span className="brief-copy">{readableText(message.subject)}</span>
      </span>
      <span className="brief-from">
        {readableText(message.fromName)}
        <MailboxMark name={mailbox} />
      </span>
    </div>
  );
}

function ArticleTeaser({
  message,
  selected,
  checked,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  onSender,
  mailbox,
}: {
  message: Message;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onSender: (message: Message) => void;
  mailbox?: string;
}) {
  return (
    <article
      className={`teaser${selected ? " selected" : ""}${checked ? " checked" : ""}`}
      onClick={() => onSelect(message.id)}
      onDoubleClick={() => onOpen(message.id)}
    >
      <div className={`hero tone-${message.hero?.tone ?? "paper"}`}>
        {selecting || checked ? (
          <Check on={checked} onToggle={() => onToggleCheck(message.id)} />
        ) : null}
        {message.hero?.label ?? message.fromEmail.split("@")[1] ?? "Letter"}
      </div>
      <h3>{readableText(message.subject)}</h3>
      <button
        type="button"
        className="sender-btn"
        onClick={(e) => {
          e.stopPropagation();
          onSender(message);
        }}
      >
        <span className="byline">
          Latest by {readableText(message.fromName)}
          {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
          {mailbox ? <span> · {mailbox}</span> : null}
          <span> · {formatWhen(message.receivedAt)}</span>
        </span>
      </button>
      <p>{lede(message)}</p>
    </article>
  );
}

function StoryTeasers({
  story,
  others = [],
  selectedId,
  checkedIds,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  onSender,
  storyDesk,
  mailboxOf,
}: {
  story: Story;
  others?: Story[];
  selectedId: string | null;
  checkedIds: Set<string>;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onSender: (message: Message) => void;
  storyDesk?: StoryDesk;
  mailboxOf?: (accountId: string) => string | undefined;
}) {
  const [lead, ...earlier] = story.messages;
  if (!lead) return null;
  return (
    <div className={earlier.length > 0 || story.pinned ? "story-stack" : undefined}>
      <StoryKicker story={story} others={others} desk={storyDesk} />
      <ArticleTeaser
        message={lead}
        selected={selectedId === lead.id}
        checked={checkedIds.has(lead.id)}
        selecting={selecting}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
        onOpen={onOpen}
        onSender={onSender}
        mailbox={mailboxOf?.(lead.accountId)}
      />
      {earlier.map((message) => (
        <BriefRow
          key={message.id}
          message={message}
          selected={selectedId === message.id}
          checked={checkedIds.has(message.id)}
          selecting={selecting}
          onSelect={onSelect}
          onToggleCheck={onToggleCheck}
          onOpen={onOpen}
          mailbox={mailboxOf?.(message.accountId)}
        />
      ))}
    </div>
  );
}

function StoryKicker({
  story,
  others,
  desk,
}: {
  story: Story;
  others: Story[];
  desk?: StoryDesk;
}) {
  if (desk && (story.messages.length > 1 || story.pinned || desk.overrides[story.id]?.title)) {
    return (
      <StoryTools
        story={story}
        others={others}
        onPin={desk.onPin}
        onRename={desk.onRename}
        onMerge={desk.onMerge}
        onReject={desk.onReject}
        onOpen={() => desk.onFilter(story.id)}
      />
    );
  }
  if (story.messages.length > 1) {
    return <div className="story-kicker">{story.messages.length} letters</div>;
  }
  return null;
}

function Check({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={on ? "check-mark on" : "check-mark"}
      aria-pressed={on}
      aria-label={on ? "Deselect" : "Select"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    />
  );
}

function MailboxMark({ name }: { name?: string }) {
  if (!name) return null;
  return <span className="mailbox-chip">{name}</span>;
}

function feedHeading(feed: FeedId): string {
  if (feed === "reading") return "Reading";
  if (feed === "uncertain") return "Uncertain";
  if (feed === "awaiting") return "Awaiting reply";
  if (feed === "radar") return "Radar";
  if (feed === "archive") return "Back issues";
  if (feed === "sent") return "Sent";
  if (feed === "drafts") return "Drafts";
  if (feed === "junk") return "Junk";
  if (feed.startsWith("custom:")) return "Folder";
  return "Mail";
}

function fileCount(message: Message): number {
  return (message.attachments ?? []).filter((a) => !a.inline).length;
}

function fileLabel(n: number): string {
  return n === 1 ? "1 file" : `${n} files`;
}
