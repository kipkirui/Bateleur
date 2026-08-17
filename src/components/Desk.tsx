type Props = {
  open: boolean;
  onToggle: () => void;
  onHire: () => void;
};

export function Desk({ open, onToggle, onHire }: Props) {
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
      <p className="desk-copy muted">
        Nothing flagged. Waiting-on is manual — the desk does not send.
      </p>
    </aside>
  );
}
