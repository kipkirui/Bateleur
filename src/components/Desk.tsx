type Props = {
  open: boolean;
  onToggle: () => void;
  onHire: () => void;
  receipt: string | null;
};

export function Desk({ open, onToggle, onHire, receipt }: Props) {
  if (!open) {
    return (
      <aside className="desk collapsed">
        <button type="button" className="desk-tab" onClick={onHire}>
          Hire staff
        </button>
      </aside>
    );
  }

  return (
    <aside className="desk">
      <div className="desk-head">
        <span>Staff</span>
        <button type="button" className="text-btn" onClick={onToggle}>
          Hide
        </button>
      </div>
      <p className="desk-copy">
        Summaries and drafts stay off until you paste a key. Mail still works
        without staff. The desk never sends.
      </p>
      <button type="button" className="desk-cta" onClick={onHire}>
        Hire staff
      </button>
      <div className="desk-label">Today</div>
      <p className="desk-copy muted">{receipt ?? "No triage counted yet today."}</p>
    </aside>
  );
}
