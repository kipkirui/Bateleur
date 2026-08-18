import { useState, type MouseEvent, type RefObject } from "react";
import { readableText } from "../lib/emailHtml";
import { formatWhen, lede } from "../lib/magazine";
import { Avatar } from "./Avatar";
import type { FeedId, Message, ReaderMode } from "../types";

type Props = {
  query: string;
  onQuery: (value: string) => void;
  onCommandHint: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  mode: ReaderMode;
  feed: FeedId;
  messages: Message[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onArchive: (message: Message) => void;
  onReply: (message: Message) => void;
  onReading: (message: Message) => void;
  onSender: (message: Message) => void;
  emptyLabel: string;
};

export function Feed({
  query,
  onQuery,
  onCommandHint,
  searchRef,
  mode,
  feed,
  messages,
  selectedId,
  onSelect,
  onOpen,
  onArchive,
  onReply,
  onReading,
  onSender,
  emptyLabel,
}: Props) {
  const actionEmpty = feed === "action" && messages.length === 0 && !query.trim();

  return (
    <section className="center">
      <div className="command">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search mail"
          aria-label="Search mail"
          onKeyDown={(e) => {
            if (e.key === "/" && query === "") {
              e.preventDefault();
              onCommandHint();
            }
          }}
        />
        <span className="command-hint">
          {query.startsWith("/") ? "Staff is off — commands need a key" : "Ctrl+K"}
        </span>
      </div>

      {actionEmpty ? (
        <div className="empty empty-clear">
          <p>Nothing needs you right now.</p>
          <p className="muted">Action is clear. Reading is still there when you want it.</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="empty">{emptyLabel}</div>
      ) : mode === "raw" ? (
        <ul className="raw-list">
          {messages.map((message) => (
            <li key={message.id}>
              <button
                type="button"
                className={selectedId === message.id ? "raw-row selected" : "raw-row"}
                onClick={() => onSelect(message.id)}
                onDoubleClick={() => onOpen(message.id)}
              >
                <span className={message.unread ? "dot unread" : "dot"} />
                <span className="raw-from">
                  {readableText(message.fromName)}
                  {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
                </span>
                <span className="raw-subject">{readableText(message.subject)}</span>
                <span className="raw-preview">{readableText(message.preview)}</span>
                <span className="raw-when">{formatWhen(message.receivedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : feed === "action" ? (
        <ActionMagazine
          messages={messages}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpen={onOpen}
          onArchive={onArchive}
          onReply={onReply}
          onReading={onReading}
          onSender={onSender}
        />
      ) : (
        <div className="block">
          <h2>{feedHeading(feed)}</h2>
          {messages.map((message) => (
            <ReadingRow
              key={message.id}
              message={message}
              selected={selectedId === message.id}
              onSelect={onSelect}
              onOpen={onOpen}
              onSender={onSender}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionMagazine({
  messages,
  selectedId,
  onSelect,
  onOpen,
  onArchive,
  onReply,
  onReading,
  onSender,
}: {
  messages: Message[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onArchive: (message: Message) => void;
  onReply: (message: Message) => void;
  onReading: (message: Message) => void;
  onSender: (message: Message) => void;
}) {
  const [lead, ...rest] = messages;
  return (
    <div className="magazine">
      <div className="block">
        <h2>Action</h2>
        {lead ? (
          <ActionCard
            key={lead.id}
            message={lead}
            lead
            selected={selectedId === lead.id}
            onSelect={onSelect}
            onOpen={onOpen}
            onArchive={onArchive}
            onReply={onReply}
            onReading={onReading}
            onSender={onSender}
          />
        ) : null}
      </div>
      {rest.length > 0 ? (
        <div className="block briefing">
          <h2>Briefing</h2>
          {rest.map((message) => (
            <ActionCard
              key={message.id}
              message={message}
              selected={selectedId === message.id}
              onSelect={onSelect}
              onOpen={onOpen}
              onArchive={onArchive}
              onReply={onReply}
              onReading={onReading}
              onSender={onSender}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActionCard({
  message,
  lead = false,
  selected,
  onSelect,
  onOpen,
  onArchive,
  onReply,
  onReading,
  onSender,
}: {
  message: Message;
  lead?: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
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

  return (
    <article
      className={`action-card${lead ? " lead" : ""}${selected ? " selected" : ""}`}
      onClick={() => onSelect(message.id)}
      onDoubleClick={() => onOpen(message.id)}
    >
      <div className="card-head">
        <button
          type="button"
          className="sender-btn"
          onClick={(e) => stop(e, () => onSender(message))}
        >
          <Avatar name={message.fromName} email={message.fromEmail} size={lead ? "lg" : "md"} />
          <span>
            <strong>
              {readableText(message.fromName)}
              {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
            </strong>
            <span className="card-when">{formatWhen(message.receivedAt)}</span>
          </span>
        </button>
        {message.category ? <span className="badge">{message.category}</span> : null}
      </div>
      <h3 className={lead ? "card-hed" : "card-hed compact"}>{readableText(message.subject)}</h3>
      <p className="card-lede">{lede(message)}</p>
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

function ReadingRow({
  message,
  selected,
  onSelect,
  onOpen,
  onSender,
}: {
  message: Message;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onSender: (message: Message) => void;
}) {
  return (
    <div
      className={selected ? "reading-row selected" : "reading-row"}
      onClick={() => onSelect(message.id)}
      onDoubleClick={() => onOpen(message.id)}
    >
      <Avatar name={message.fromName} email={message.fromEmail} size="sm" />
      <button type="button" className="sender-btn reading-from" onClick={(e) => {
        e.stopPropagation();
        onSender(message);
      }}>
        {readableText(message.fromName)}
        {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
      </button>
      <span className="reading-copy">
        <span className="reading-subject">{readableText(message.subject)}</span>
        <span className="reading-preview">{lede(message)}</span>
      </span>
      <span className="reading-when">{formatWhen(message.receivedAt)}</span>
    </div>
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
