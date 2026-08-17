import { useEffect } from "react";

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onCancel();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <footer>
          <button type="button" className="text-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "desk-cta danger" : "desk-cta"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
