import { readableText } from "../lib/emailHtml";
import { formatWhen } from "../lib/magazine";
import type { Clipping } from "../types";

type Props = {
  clippings: Clipping[];
  onClose: () => void;
  onOpen: (messageId: string) => void;
  onRemove: (id: string) => void;
};

export function Clippings({ clippings, onClose, onOpen, onRemove }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <article className="reader sender-page">
        <header>
          <button type="button" className="text-btn" onClick={onClose}>
            Back
          </button>
          <span className="reader-meta">Esc</span>
        </header>
        <h1>Clippings</h1>
        <p className="muted">
          Quotes you kept from letters. Not a notebook — confirmation numbers, addresses, a line
          worth keeping.
        </p>
        {clippings.length === 0 ? (
          <p className="muted">Select text in a letter and Keep it.</p>
        ) : (
          <ul className="clip-list">
            {clippings.map((clip) => (
              <li key={clip.id} className="clip-item">
                <blockquote className="clip-quote">{clip.quote}</blockquote>
                <div className="clip-meta">
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => onOpen(clip.messageId)}
                  >
                    {readableText(clip.fromName) || clip.fromEmail || "Letter"}
                    {clip.subject ? ` · ${readableText(clip.subject)}` : ""}
                  </button>
                  <span className="muted">{formatWhen(clip.at)}</span>
                  <button type="button" className="text-btn" onClick={() => onRemove(clip.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
