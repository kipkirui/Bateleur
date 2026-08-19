import { readableText } from "../lib/emailHtml";
import { formatWhen, newestFirst, sendFrequency } from "../lib/magazine";
import { Avatar } from "./Avatar";
import type { Message } from "../types";

type Props = {
  email: string;
  messages: Message[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onAlwaysReading: () => void;
  onGuessAgain: () => void;
};

export function SenderPage({
  email,
  messages,
  onClose,
  onOpen,
  onAlwaysReading,
  onGuessAgain,
}: Props) {
  const listed = newestFirst(messages);
  const name = listed[0] ? readableText(listed[0].fromName) : email;
  const inbox = listed.filter((m) => m.folder === "inbox");
  const locked = inbox.length > 0 && inbox.every((m) => m.feed === "reading");

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <article className="reader sender-page">
        <header>
          <button type="button" className="text-btn" onClick={onClose}>
            Back
          </button>
          <span className="reader-meta">Esc</span>
        </header>
        <div className="sender-hero">
          <Avatar name={name} email={email} size="lg" />
          <div>
            <h1>{name}</h1>
            <div className="byline">
              {email} · {sendFrequency(messages, email)}
            </div>
          </div>
        </div>
        <div className="card-actions">
          <button type="button" className="text-btn" onClick={onAlwaysReading}>
            Keep in Reading
          </button>
          {locked ? (
            <button type="button" className="text-btn" onClick={onGuessAgain}>
              Guess again
            </button>
          ) : null}
        </div>
        <div className="block">
          <h2>From this sender</h2>
          {listed.length === 0 ? (
            <p className="muted">No cached letters from this address.</p>
          ) : (
            listed.map((message) => (
              <button
                key={message.id}
                type="button"
                className="reading-row sender-letter"
                onClick={() => onOpen(message.id)}
              >
                <span className="reading-copy">
                  <span className="reading-subject">{readableText(message.subject)}</span>
                  <span className="reading-preview">{readableText(message.preview)}</span>
                </span>
                <span className="reading-when">{formatWhen(message.receivedAt)}</span>
              </button>
            ))
          )}
        </div>
      </article>
    </div>
  );
}
