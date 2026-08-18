import { useEffect, useState } from "react";
import { draftReply, draftRsvp, loadInlineParts, openInvite, saveAttachment, staffLetter, summarizeMail, triageMail } from "../api";
import { hasRemoteImages, readableText, rewriteCidImages } from "../lib/emailHtml";
import { formatWhen, lede, readingTime, sendFrequency } from "../lib/magazine";
import { threadLetters } from "../lib/stories";
import { Avatar } from "./Avatar";
import { Letter, letterHtml } from "./Letter";
import type { MailTo } from "../lib/links";
import type { Account, Attachment, Clipping, InlinePart, Message, StaffStatus, StaffSummary, StoryOverride } from "../types";

type Props = {
  message: Message;
  account?: Account;
  mailbox: Message[];
  onClose: () => void;
  onReply: () => void;
  onReplyAll?: () => void;
  onForward: () => void;
  onUnread: () => void;
  onFlag: () => void;
  onArchive: () => void;
  onMailTo: (mail: MailTo) => void;
  onSender: () => void;
  onOpen: (id: string) => void;
  onAction?: () => void;
  onReading?: () => void;
  remoteImages: boolean;
  onRemoteImages: (on: boolean) => void;
  staff: StaffStatus;
  onHire: () => void;
  onDraft: (body: string) => void;
  onTriaged?: () => void;
  storyOverrides?: Record<string, StoryOverride>;
  clippings?: Clipping[];
  onKeep?: (quote: string) => void;
  onDropClip?: (id: string) => void;
};

export function Reader({
  message,
  account,
  mailbox,
  onClose,
  onReply,
  onReplyAll,
  onForward,
  onUnread,
  onFlag,
  onArchive,
  onMailTo,
  onSender,
  onOpen,
  onAction,
  onReading,
  remoteImages,
  onRemoteImages,
  staff,
  onHire,
  onDraft,
  onTriaged,
  storyOverrides = {},
  clippings = [],
  onKeep,
  onDropClip,
}: Props) {
  const html = letterHtml(message);
  const files = (message.attachments ?? []).filter((a) => !a.inline);
  const [cidParts, setCidParts] = useState<InlinePart[]>([]);
  const [thisLetter, setThisLetter] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [staffBusy, setStaffBusy] = useState<"summarize" | "draft" | "triage" | "rsvp" | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const quote = lede(message);
  const thread = threadLetters(mailbox, message, storyOverrides);
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
    setSummary(null);
    setSavedDraft(null);
    setStaffError(null);
    setPendingQuote(null);
    let cancelled = false;
    void staffLetter(message.id)
      .then((notes) => {
        if (cancelled) return;
        setSummary(notes.summary);
        setSavedDraft(notes.draft);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setSavedDraft(null);
        }
      });
    return () => {
      cancelled = true;
    };
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

  async function onSummarize() {
    setStaffBusy("summarize");
    setStaffError(null);
    try {
      setSummary(await summarizeMail(message.id));
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : String(err));
    } finally {
      setStaffBusy(null);
    }
  }

  async function onStaffDraft() {
    setStaffBusy("draft");
    setStaffError(null);
    try {
      const next = await draftReply(message.id);
      setSavedDraft(next.body);
      onDraft(next.body);
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : String(err));
    } finally {
      setStaffBusy(null);
    }
  }

  async function onTriage() {
    setStaffBusy("triage");
    setStaffError(null);
    try {
      await triageMail(message.id);
      onTriaged?.();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : String(err));
    } finally {
      setStaffBusy(null);
    }
  }

  async function onOpenInvite() {
    setInviteNote(null);
    try {
      await openInvite(message.id);
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function onRsvp() {
    setStaffBusy("rsvp");
    setStaffError(null);
    try {
      const next = await draftRsvp(message.id);
      setSavedDraft(next.body);
      onDraft(next.body);
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : String(err));
    } finally {
      setStaffBusy(null);
    }
  }

  const showStaff = staff.summarize || staff.drafts || staff.triage || (staff.schedule && Boolean(message.invite));
  const invite = message.invite;

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
        {pendingQuote && onKeep ? (
          <div className="clip-bar">
            <blockquote className="clip-quote">{pendingQuote}</blockquote>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                onKeep(pendingQuote);
                setPendingQuote(null);
              }}
            >
              Keep
            </button>
          </div>
        ) : null}
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
        {invite ? (
          <aside className="radar-card">
            <div className="rail-label">Radar</div>
            <p className="radar-title">{invite.summary}</p>
            <p className="radar-when">{invite.when}</p>
            {invite.location ? <p className="muted">{invite.location}</p> : null}
            {invite.organizer ? <p className="muted">{invite.organizer}</p> : null}
            <div className="card-actions">
              <button type="button" className="text-btn" onClick={() => void onOpenInvite()}>
                Open in calendar
              </button>
              <button type="button" className="text-btn" onClick={onReply}>
                Reply
              </button>
              {staff.schedule ? (
                staff.hired ? (
                  <button
                    type="button"
                    className="text-btn"
                    disabled={staffBusy !== null}
                    onClick={() => void onRsvp()}
                  >
                    {staffBusy === "rsvp" ? "Drafting…" : "Draft an RSVP"}
                  </button>
                ) : (
                  <button type="button" className="text-btn" onClick={onHire}>
                    Hire staff to RSVP
                  </button>
                )
              ) : null}
            </div>
            {inviteNote ? <p className="muted">{inviteNote}</p> : null}
          </aside>
        ) : null}
        {showStaff ? (
          <aside className="staff-note">
            <div className="rail-label">Staff</div>
            {summary ? <p className="staff-blurb">{summary.blurb}</p> : null}
            {summary?.keywords.length ? (
              <p className="staff-keys">
                {summary.keywords.map((word) => (
                  <span key={word} className="badge">
                    {word}
                  </span>
                ))}
              </p>
            ) : null}
            {!summary && staff.summarize && !staffError && !staff.hired ? (
              <p className="muted">Hire staff and paste a key to summarize.</p>
            ) : null}
            {staff.triage && message.why ? (
              <p className="muted">{message.why}</p>
            ) : null}
            {staffError ? <p className="muted staff-error">{staffError}</p> : null}
            <div className="staff-note-actions">
              {staff.summarize ? (
                staff.hired ? (
                  <button
                    type="button"
                    className="text-btn"
                    disabled={staffBusy !== null}
                    onClick={() => void onSummarize()}
                  >
                    {staffBusy === "summarize"
                      ? "Summarizing…"
                      : summary
                        ? "Summarize again"
                        : "Summarize this letter"}
                  </button>
                ) : (
                  <button type="button" className="text-btn" onClick={onHire}>
                    Hire staff to summarize
                  </button>
                )
              ) : null}
              {staff.drafts ? (
                staff.hired ? (
                  <>
                    <button
                      type="button"
                      className="text-btn"
                      disabled={staffBusy !== null}
                      onClick={() => void onStaffDraft()}
                    >
                      {staffBusy === "draft" ? "Drafting…" : "Draft a reply"}
                    </button>
                    {savedDraft ? (
                      <button
                        type="button"
                        className="text-btn"
                        disabled={staffBusy !== null}
                        onClick={() => onDraft(savedDraft)}
                      >
                        Open last draft
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button type="button" className="text-btn" onClick={onHire}>
                    Hire staff to draft
                  </button>
                )
              ) : null}
              {staff.triage ? (
                staff.hired ? (
                  <button
                    type="button"
                    className="text-btn"
                    disabled={staffBusy !== null}
                    onClick={() => void onTriage()}
                  >
                    {staffBusy === "triage"
                      ? "Triaging…"
                      : message.why?.startsWith("Staff:")
                        ? "Triage again"
                        : "Triage this letter"}
                  </button>
                ) : (
                  <button type="button" className="text-btn" onClick={onHire}>
                    Hire staff to triage
                  </button>
                )
              ) : null}
            </div>
          </aside>
        ) : null}
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
          onQuote={setPendingQuote}
        />
        {clippings.filter((clip) => clip.messageId === message.id).length > 0 ? (
          <div className="clip-kept">
            <div className="rail-label">Kept from this letter</div>
            {clippings
              .filter((clip) => clip.messageId === message.id)
              .map((clip) => (
                <div key={clip.id} className="clip-item">
                  <blockquote className="clip-quote">{clip.quote}</blockquote>
                  {onDropClip ? (
                    <button type="button" className="text-btn" onClick={() => onDropClip(clip.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}
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
            {message.folder !== "archive" ? (
              <button type="button" className="text-btn" onClick={onArchive}>
                Archive
              </button>
            ) : null}
            {onReplyAll ? (
              <button type="button" className="text-btn" onClick={onReplyAll}>
                Reply all
              </button>
            ) : null}
            <button type="button" className="text-btn" onClick={onForward}>
              Forward
            </button>
            {onAction ? (
              <button type="button" className="text-btn" onClick={onAction}>
                Action
              </button>
            ) : null}
            {onReading ? (
              <button type="button" className="text-btn" onClick={onReading}>
                Reading
              </button>
            ) : null}
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
