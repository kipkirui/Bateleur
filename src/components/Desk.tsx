type Props = {
  open: boolean;
  onToggle: () => void;
  onHire: () => void;
  receipt: string | null;
  hired: boolean;
  summarize: boolean;
  drafts: boolean;
};

export function Desk({
  open,
  onToggle,
  onHire,
  receipt,
  hired,
  summarize,
  drafts,
}: Props) {
  if (!open) {
    return (
      <aside className="desk collapsed">
        <button type="button" className="desk-tab" onClick={onHire}>
          {hired ? "Staff" : "Hire staff"}
        </button>
      </aside>
    );
  }

  const copy = hired
    ? deskCopy(summarize, drafts)
    : "Summaries and drafts stay off until you paste a key. Mail still works without staff. The desk never sends.";

  return (
    <aside className="desk">
      <div className="desk-head">
        <span>Staff</span>
        <button type="button" className="text-btn" onClick={onToggle}>
          Hide
        </button>
      </div>
      <p className="desk-copy">{copy}</p>
      <button type="button" className="desk-cta" onClick={onHire}>
        {hired ? "Edit staff" : "Hire staff"}
      </button>
      <div className="desk-label">Today</div>
      <p className="desk-copy muted">{receipt ?? "No triage counted yet today."}</p>
    </aside>
  );
}

function deskCopy(summarize: boolean, drafts: boolean): string {
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
