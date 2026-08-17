import { useEffect, useState } from "react";
import { loadInlineParts, saveAttachment } from "../api";
import { hasRemoteImages, readableText, rewriteCidImages } from "../lib/emailHtml";
import { Letter, letterHtml } from "./Letter";
import type { MailTo } from "../lib/links";
import type { Account, Attachment, InlinePart, Message } from "../types";

type Props = {
  message: Message;
  account?: Account;
  onClose: () => void;
  onReply: () => void;
  onUnread: () => void;
  onFlag: () => void;
  onArchive: () => void;
  onMailTo: (mail: MailTo) => void;
  remoteImages: boolean;
  onRemoteImages: (on: boolean) => void;
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
  remoteImages,
  onRemoteImages,
}: Props) {
  const html = letterHtml(message);
  const files = (message.attachments ?? []).filter((a) => !a.inline);
  const [cidParts, setCidParts] = useState<InlinePart[]>([]);
  const [thisLetter, setThisLetter] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

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
        <h1>{readableText(message.subject)}</h1>
        <div className="byline">
          {readableText(message.fromName)} &lt;{message.fromEmail}&gt;
          {message.flagged ? <span className="flag-mark" title="Flagged" /> : null}
        </div>
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
