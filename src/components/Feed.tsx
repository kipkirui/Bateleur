import type { RefObject } from "react";
import { readableText } from "../lib/emailHtml";
import type { Message, ReaderMode } from "../types";

type Props = {
  query: string;
  onQuery: (value: string) => void;
  onCommandHint: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  mode: ReaderMode;
  messages: Message[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  emptyLabel: string;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

export function Feed({
  query,
  onQuery,
  onCommandHint,
  searchRef,
  mode,
  messages,
  selectedId,
  onSelect,
  onOpen,
  emptyLabel,
}: Props) {
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

      {messages.length === 0 ? (
        <div className="empty">{emptyLabel}</div>
      ) : mode === "raw" ? (
        <ul className="raw-list">
          {messages.map((message) => (
            <li key={message.id}>
              <button
                type="button"
                className={
                  selectedId === message.id ? "raw-row selected" : "raw-row"
                }
                onClick={() => onSelect(message.id)}
                onDoubleClick={() => onOpen(message.id)}
              >
                <span className={message.unread ? "dot unread" : "dot"} />
                <span className="raw-from">{readableText(message.fromName)}</span>
                <span className="raw-subject">{readableText(message.subject)}</span>
                <span className="raw-preview">{readableText(message.preview)}</span>
                <span className="raw-when">{formatWhen(message.receivedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="magazine">
          {messages.some((m) => m.feed === "action") ? (
            <div className="block">
              <h2>Action</h2>
              {messages
                .filter((m) => m.feed === "action")
                .map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    className={
                      selectedId === message.id
                        ? "action-row selected"
                        : "action-row"
                    }
                    onClick={() => onSelect(message.id)}
                    onDoubleClick={() => onOpen(message.id)}
                  >
                    <div className="action-top">
                      <strong>{readableText(message.fromName)}</strong>
                      <span>{formatWhen(message.receivedAt)}</span>
                    </div>
                    <div className="action-subject">{readableText(message.subject)}</div>
                    <p>{readableText(message.preview)}</p>
                  </button>
                ))}
            </div>
          ) : null}

          {messages.some((m) => m.feed === "reading") ? (
            <div className="block">
              <h2>Reading</h2>
              {messages
                .filter((m) => m.feed === "reading")
                .map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    className={
                      selectedId === message.id
                        ? "article selected"
                        : "article"
                    }
                    onClick={() => onSelect(message.id)}
                    onDoubleClick={() => onOpen(message.id)}
                  >
                    {message.hero ? (
                      <div className={`hero tone-${message.hero.tone}`}>
                        {message.hero.label}
                      </div>
                    ) : null}
                    <h3>{readableText(message.subject)}</h3>
                    <div className="byline">
                      Latest by {readableText(message.fromName)}
                    </div>
                    <p>{readableText(message.preview)}</p>
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
