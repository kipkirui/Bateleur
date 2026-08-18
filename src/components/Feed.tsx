import { useState, type MouseEvent } from "react";
import { readableText } from "../lib/emailHtml";
import { formatWhen, lede } from "../lib/magazine";
import { groupStories } from "../lib/stories";
import { Avatar } from "./Avatar";
import type { FeedId, Message, ReaderMode } from "../types";

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
  onSender: (message: Message) => void;
  onBulkArchive: () => void;
  onBulkFlag: () => void;
  onClearChecked: () => void;
  emptyLabel: string;
  receiptLine?: string | null;
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
  onSender,
  onBulkArchive,
  onBulkFlag,
  onClearChecked,
  emptyLabel,
  receiptLine,
}: Props) {
  const checked = checkedIds.size;
  const selecting = checked > 0;
  const actionEmpty = feed === "action" && messages.length === 0;

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

      <div className="feed-scroll">
        {actionEmpty ? (
          <div className="empty empty-clear">
            <p>Nothing needs you right now.</p>
            <p className="muted">
              {receiptLine ?? "Action is clear. Reading is still there when you want it."}
            </p>
          </div>
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
          />
        ) : (
          <div className="magazine">
            <div className="block">
              <h2>{feedHeading(feed)}</h2>
              {groupStories(messages).map((story) => (
                <StoryTeasers
                  key={story.id}
                  story={story}
                  selectedId={selectedId}
                  checkedIds={checkedIds}
                  selecting={selecting}
                  onSelect={onSelect}
                  onToggleCheck={onToggleCheck}
                  onOpen={onOpen}
                  onSender={onSender}
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
}) {
  const stories = groupStories(messages);
  const [cover, ...rest] = stories;
  const lead = cover?.messages[0];
  return (
    <div className="magazine">
      {lead ? (
        <div className="block">
          <h2>Cover</h2>
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
            />
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div className="block briefing">
          <h2>Briefing</h2>
          {rest.map((story) => (
            <div key={story.id} className={story.messages.length > 1 ? "story-stack" : undefined}>
              {story.messages.length > 1 ? (
                <div className="story-kicker">{story.messages.length} letters</div>
              ) : null}
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
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {digest.length > 0 ? (
        <div className="block">
          <h2>Reading</h2>
          {groupStories(digest).map((story) => (
            <StoryTeasers
              key={story.id}
              story={story}
              selectedId={selectedId}
              checkedIds={checkedIds}
              selecting={selecting}
              onSelect={onSelect}
              onToggleCheck={onToggleCheck}
              onOpen={onOpen}
              onSender={onSender}
            />
          ))}
        </div>
      ) : null}
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
}) {
  const [why, setWhy] = useState(false);

  function stop(event: MouseEvent, fn: () => void) {
    event.stopPropagation();
    fn();
  }

  const kicker = [
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
}: {
  message: Message;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
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
      <span className="brief-from">{readableText(message.fromName)}</span>
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
}: {
  message: Message;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onSender: (message: Message) => void;
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
          <span> · {formatWhen(message.receivedAt)}</span>
        </span>
      </button>
      <p>{lede(message)}</p>
    </article>
  );
}

function StoryTeasers({
  story,
  selectedId,
  checkedIds,
  selecting,
  onSelect,
  onToggleCheck,
  onOpen,
  onSender,
}: {
  story: { id: string; messages: Message[] };
  selectedId: string | null;
  checkedIds: Set<string>;
  selecting: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onOpen: (id: string) => void;
  onSender: (message: Message) => void;
}) {
  const [lead, ...earlier] = story.messages;
  if (!lead) return null;
  return (
    <div className={earlier.length > 0 ? "story-stack" : undefined}>
      {earlier.length > 0 ? (
        <div className="story-kicker">{story.messages.length} letters</div>
      ) : null}
      <ArticleTeaser
        message={lead}
        selected={selectedId === lead.id}
        checked={checkedIds.has(lead.id)}
        selecting={selecting}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
        onOpen={onOpen}
        onSender={onSender}
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
        />
      ))}
    </div>
  );
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

function feedHeading(feed: FeedId): string {
  if (feed === "reading") return "Reading";
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
