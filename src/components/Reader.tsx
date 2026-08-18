import { useEffect, useState } from "react";
import { loadInlineParts, saveAttachment } from "../api";
import { hasRemoteImages, readableText, rewriteCidImages } from "../lib/emailHtml";
import { formatWhen, lede, readingTime, sendFrequency } from "../lib/magazine";
import { threadLetters } from "../lib/stories";
import { Avatar } from "./Avatar";
import { Letter, letterHtml } from "./Letter";
import type { MailTo } from "../lib/links";
import type { Account, Attachment, InlinePart, Message } from "../types";

type Props = {
  message: Message;
  account?: Account;
  mailbox: Message[];
  onClose: () => void;
  onReply: () => void;
  onUnread: () => void;
  onFlag: () => void;
  onArchive: () => void;
  onMailTo: (mail: MailTo) => void;
  onSender: () => void;
  onOpen: (id: string) => void;
  remoteImages: boolean;
  onRemoteImages: (on: boolean) => void;
};

export function Reader({
  message,
  account,
  mailbox,
  onClose,
  onReply,
  onUnread,
  onFlag,
  onArchive,
  onMailTo,
  onSender,
  onOpen,
  remoteImages,
  onRemoteImages,
}: Props) {
  const html = letterHtml(message);
  const files = (message.attachments ?? []).filter((a) => !a.inline);
  const [cidParts, setCidParts] = useState<InlinePart[]>([]);
  const [thisLetter, setThisLetter] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const quote = lede(message);
  const thread = threadLetters(mailbox, message);
  const related = mailbox
    .filter(
      (m) =>
        m.id !== message.id &&
        m.fromEmail.toLowerCase() === message.fromEmail.toLowerCase() &&
        !thread.some((item) => item.id === m.id),
    )
    .slice(0, 8);

  useEffect(() => {
    const need = (message.attachments ?? []).some(
      (a) => a.inline && a.stored !== false && a.contentId,
    );
    if (!need) {
      setCidParts([]);
      return;
    }
    let cancelled = false;
    loadInlineParts(message.id)
      .then((parts) => {
        if (!cancelled) setCidParts(parts);
      })
      .catch(() => {
        if (!cancelled) setCidParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, message.attachments]);

  useEffect(() => {
    setThisLetter(false);
  }, [message.id]);

  const allowRemote = remoteImages || thisLetter;
  const showRemoteBar =
    !allowRemote &&
    Boolean(html) &&
    hasRemoteImages(rewriteCidImages(html ?? "", cidParts));

  async function onSave(file: Attachment) {
    setSavingId(file.id);
    setSaveNote(null);
    try {
      const path = await saveAttachment(file.id);
      setSaveNote(`Saved to ${path}`);
    } catch (err) {
      setSaveNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

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
        <div className="article-byline">
          <button type="button" className="sender-btn" onClick={onSender}>
            <Avatar name={message.fromName} email={message.fromEmail} size="md" />
            <span>
              <strong>{readableText(message.fromName)}</strong>
              <span className="byline">
                {message.fromEmail} · {sendFrequency(mailbox, message.fromEmail)}
                {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
              </span>
            </span>
          </button>
          <span className="reader-meta">
            {formatWhen(message.receivedAt)}
            {message.category ? <span className="badge">{message.category}</span> : null}
          </span>
        </div>
        <h1 className="article-hed">{readableText(message.subject)}</h1>
        <p className="read-time">{readingTime(message)}</p>
        {quote ? <blockquote className="lede-quote">{quote}</blockquote> : null}
        {thread.length >= 3 ? (
          <ol className="thread-toc">
            {thread.map((item, index) => (
              <li key={item.id}>
                {item.id === message.id ? (
                  <span>
                    {index + 1}. {readableText(item.fromName)} · {formatWhen(item.receivedAt)}
                  </span>
                ) : (
                  <button type="button" className="text-btn" onClick={() => onOpen(item.id)}>
                    {index + 1}. {readableText(item.fromName)} · {formatWhen(item.receivedAt)}
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : null}
        <Letter
          message={message}
          onMailTo={onMailTo}
          cidParts={cidParts}
          remoteImages={allowRemote}
        />
        {showRemoteBar ? (
          <div className="remote-bar">
            <span>Remote images are blocked.</span>
            <button type="button" className="text-btn" onClick={() => setThisLetter(true)}>
              Load for this letter
            </button>
            <button type="button" className="text-btn" onClick={() => onRemoteImages(true)}>
              Always load
            </button>
          </div>
        ) : null}
        {files.length > 0 ? (
          <div className="attach-list">
            <div className="rail-label">Files</div>
            {files.map((file) => (
              <div key={file.id} className="attach-row">
                <span>
                  {file.filename}
                  <span className="muted"> · {formatSize(file.size)}</span>
                </span>
                <button
                  type="button"
                  className="text-btn"
                  disabled={savingId === file.id || file.stored === false}
                  onClick={() => void onSave(file)}
                >
                  {file.stored === false
                    ? "Too large"
                    : savingId === file.id
                      ? "Saving…"
                      : "Save"}
                </button>
              </div>
            ))}
            {saveNote ? <p className="muted">{saveNote}</p> : null}
          </div>
        ) : null}
        {related.length > 0 ? (
          <div className="more-from">
            <div className="rail-label">More from this sender</div>
            {related.map((item) => (
              <button
                key={item.id}
                type="button"
                className="more-row"
                onClick={() => onOpen(item.id)}
              >
                <span>{readableText(item.subject)}</span>
                <span className="muted">{formatWhen(item.receivedAt)}</span>
              </button>
            ))}
          </div>
        ) : null}
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
