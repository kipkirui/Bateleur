import { useState } from "react";
import { draftReply } from "../api";
import { readableText } from "../lib/emailHtml";
import type { Message } from "../types";

type Props = {
  open: boolean;
  onToggle: () => void;
  onHire: () => void;
  onBrief?: () => void;
  briefBusy?: boolean;
  receipt: string | null;
  hired: boolean;
  summarize: boolean;
  summarizeAccount: boolean;
  drafts: boolean;
  next?: Message | null;
  onOpenNext?: () => void;
  onReplyNext?: () => void;
  onDraftNext?: (body: string) => void;
};

export function Desk({
  open,
  onToggle,
  onHire,
  onBrief,
  briefBusy,
  receipt,
  hired,
  summarize,
  summarizeAccount,
  drafts,
  next = null,
  onOpenNext,
  onReplyNext,
  onDraftNext,
}: Props) {
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  if (!open) {
    const tab = !hired ? "Hire staff" : next ? "Next" : "Staff";
    return (
      <aside className="desk collapsed">
        <button type="button" className="desk-tab" onClick={hired ? onToggle : onHire}>
          {tab}
        </button>
      </aside>
    );
  }

  const copy = hired
    ? deskCopy(summarize, summarizeAccount, drafts, Boolean(next))
    : "Summaries and drafts stay off until you paste a key. Mail still works without staff. The desk never sends.";

  async function writeDraft() {
    if (!next || !onDraftNext) return;
    setDraftBusy(true);
    setDraftError(null);
    try {
      const drafted = await draftReply(next.id);
      onDraftNext(drafted.body);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftBusy(false);
    }
  }

  return (
    <aside className="desk">
      <div className="desk-head">
        <span>{hired && next ? "Next" : "Staff"}</span>
        <button type="button" className="text-btn" onClick={onToggle}>
          Hide
        </button>
      </div>
      {hired && next ? (
        <div className="desk-next">
          <p className="desk-next-from">{readableText(next.fromName) || next.fromEmail}</p>
          <p className="desk-next-subject">{readableText(next.subject)}</p>
          <div className="card-actions">
            {onOpenNext ? (
              <button type="button" className="text-btn" onClick={onOpenNext}>
                Open
              </button>
            ) : null}
            {onReplyNext ? (
              <button type="button" className="text-btn" onClick={onReplyNext}>
                Reply
              </button>
            ) : null}
            {drafts && onDraftNext ? (
              <button type="button" className="text-btn" disabled={draftBusy} onClick={() => void writeDraft()}>
                {draftBusy ? "Drafting…" : "Draft a reply"}
              </button>
            ) : null}
          </div>
          {draftError ? <p className="desk-copy muted">{draftError}</p> : null}
        </div>
      ) : (
        <p className="desk-copy">{copy}</p>
      )}
      {hired && next ? <p className="desk-copy muted">{copy}</p> : null}
      {hired && summarizeAccount && onBrief ? (
        <button
          type="button"
          className="desk-cta"
          disabled={briefBusy}
          onClick={onBrief}
        >
          {briefBusy ? "Writing…" : "Write the Brief"}
        </button>
      ) : null}
      <button type="button" className={hired && summarizeAccount ? "text-btn" : "desk-cta"} onClick={onHire}>
        {hired ? "Edit staff" : "Hire staff"}
      </button>
      <div className="desk-label">Today</div>
      <p className="desk-copy muted">{receipt ?? "No triage counted yet today."}</p>
    </aside>
  );
}

function deskCopy(
  summarize: boolean,
  summarizeAccount: boolean,
  drafts: boolean,
  hasNext: boolean,
): string {
  if (hasNext) {
    return "One letter at a time. The desk never sends.";
  }
  if (summarizeAccount) {
    return "The Brief is a deck of unread Action. Write it from here or the feed. The desk never sends.";
  }
  if (summarize && drafts) {
    return "Summarize or draft from the reader. A draft opens in Compose — Send is still yours. The desk never sends.";
  }
  if (summarize) {
    return "Summarize this letter from the reader. Mail still works if a call fails. The desk never sends.";
  }
  if (drafts) {
    return "Draft a reply from the reader. It opens in Compose and never sends on its own.";
  }
  return "Staff is hired. Turn on a capability in Edit staff to run. The desk never sends.";
}
