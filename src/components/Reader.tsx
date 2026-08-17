import { readableText } from "../lib/emailHtml";
import { Letter, letterHtml } from "./Letter";
import type { MailTo } from "../lib/links";
import type { Account, Message } from "../types";

type Props = {
  message: Message;
  account?: Account;
  onClose: () => void;
  onReply: () => void;
  onUnread: () => void;
  onFlag: () => void;
  onArchive: () => void;
  onMailTo: (mail: MailTo) => void;
};

export function Reader({
  message,
  account,
  onClose,
  onReply,
  onUnread,
  onFlag,
  onArchive,
  onMailTo,
}: Props) {
  const html = letterHtml(message);
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <article className={html ? "reader reader-wide" : "reader"}>
        <header>
          <button type="button" className="text-btn" onClick={onClose}>
            Back
          </button>
          <span className="reader-meta">
            {account?.label ?? "Mailbox"} · Esc
          </span>
        </header>
        <h1>{readableText(message.subject)}</h1>
        <div className="byline">
          {readableText(message.fromName)} &lt;{message.fromEmail}&gt;
          {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
        </div>
        <Letter message={message} onMailTo={onMailTo} />
        <footer>
          <div className="reader-actions">
            <button type="button" className="text-btn" onClick={onUnread}>
              Unread
            </button>
            <button type="button" className="text-btn" onClick={onFlag}>
              {message.flagged ? "Unflag" : "Flag"}
            </button>
            <button type="button" className="text-btn" onClick={onArchive}>
              Archive
            </button>
          </div>
          <button type="button" className="desk-cta" onClick={onReply}>
            Reply
          </button>
        </footer>
      </article>
    </div>
  );
}
