import { readableText } from "../lib/emailHtml";
import type { WaitingItem } from "../lib/waiting";

type Props = {
  open: boolean;
  onToggle: () => void;
  onHire: () => void;
  waiting: WaitingItem[];
  receipt: string | null;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
};

export function Desk({
  open,
  onToggle,
  onHire,
  waiting,
  receipt,
  onOpen,
  onDismiss,
}: Props) {
  if (!open) {
    return (
      <aside className="desk collapsed">
        {waiting.length > 0 ? (
          <button type="button" className="desk-tab has-wait" onClick={onToggle}>
            {waiting.length} waiting-on
          </button>
        ) : (
          <button type="button" className="desk-tab" onClick={onHire}>
            Hire staff
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="desk">
      <div className="desk-head">
        <span>Desk</span>
        <button type="button" className="text-btn" onClick={onToggle}>
          Hide
        </button>
      </div>
      <p className="desk-copy">
        Staff is off. Bateleur is a mail client until you paste an API key.
        Summaries and drafts stay provisions — they do not run on this inbox.
      </p>
      <button type="button" className="desk-cta" onClick={onHire}>
        Hire staff
      </button>
      <div className="desk-label">Waiting-on</div>
      {waiting.length === 0 ? (
        <p className="desk-copy muted">
          Nothing open. Flag a letter, or a sent letter with no reply after four days
          lands here. The desk does not send.
        </p>
      ) : (
        <ul className="desk-wait">
          {waiting.map((item) => (
            <li key={item.id}>
              <button type="button" className="desk-wait-item" onClick={() => onOpen(item.id)}>
                <strong>{readableText(item.counterpart) || "Someone"}</strong>
                <span className="muted">{item.reason}</span>
                <span className="desk-wait-subject">{readableText(item.message.subject)}</span>
              </button>
              {item.kind === "stale" ? (
                <button type="button" className="text-btn" onClick={() => onDismiss(item.id)}>
                  Dismiss
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="desk-label">Today</div>
      <p className="desk-copy muted">{receipt ?? "No triage counted yet today."}</p>
    </aside>
  );
}
