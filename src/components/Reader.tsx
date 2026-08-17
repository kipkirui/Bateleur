import { readableText } from "../lib/emailHtml";
import { Letter, letterHtml } from "./Letter";
import type { MailTo } from "../lib/links";
import type { Account, Message } from "../types";

type Props = {
  message: Message;
  account?: Account;
  onClose: () => void;
  onReply: () => void;
  onMailTo: (mail: MailTo) => void;
};

export function Reader({ message, account, onClose, onReply, onMailTo }: Props) {
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
        </div>
        <Letter message={message} onMailTo={onMailTo} />
        <footer>
          <button type="button" className="desk-cta" onClick={onReply}>
            Reply
          </button>
        </footer>
      </article>
    </div>
  );
}
