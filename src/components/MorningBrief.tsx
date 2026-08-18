import type { StaffBrief } from "../types";

type Props = {
  brief: StaffBrief | null;
  busy: boolean;
  error: string | null;
  onWrite: () => void;
  onOpen: (id: string) => void;
};

export function MorningBrief({ brief, busy, error, onWrite, onOpen }: Props) {
  return (
    <aside className="morning-brief">
      <div className="brief-head">
        <span className="rail-label">Brief</span>
        <button type="button" className="text-btn" disabled={busy} onClick={onWrite}>
          {busy ? "Writing…" : brief ? "Refresh brief" : "Write the Brief"}
        </button>
      </div>
      {brief ? <p className="staff-blurb">{brief.blurb}</p> : (
        <p className="muted">Up to eight unread Action letters. A line leaves once you read it.</p>
      )}
      {brief?.items.length ? (
        <ul className="brief-items">
          {brief.items.map((item) => (
            <li key={item.id}>
              <button type="button" className="text-btn" onClick={() => onOpen(item.id)}>
                {item.line}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="muted staff-error">{error}</p> : null}
    </aside>
  );
}
