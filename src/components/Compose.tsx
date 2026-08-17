import { useState } from "react";
import { readableText } from "../lib/emailHtml";
import type { Account } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { LetterEditor } from "./LetterEditor";

type Props = {
  accounts: Account[];
  fromId: string;
  onFrom: (id: string) => void;
  to: string;
  subject: string;
  body: string;
  onTo: (value: string) => void;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSend: () => void;
};

export function Compose({
  accounts,
  fromId,
  onFrom,
  to,
  subject,
  body,
  onTo,
  onSubject,
  onBody,
  busy,
  error,
  onClose,
  onSend,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const hasBody = readableText(body).length > 0;
  const canSend =
    accounts.length > 0 && to.trim().length > 0 && hasBody && !busy;

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          setConfirming(true);
        }}
      >
        <header>
          <span>New letter</span>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </header>
        {accounts.length === 0 ? (
          <p className="muted">Add a mailbox in Settings before sending.</p>
        ) : (
          <label>
            From
            <select value={fromId} onChange={(e) => onFrom(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} · {account.address}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          To
          <input
            value={to}
            onChange={(e) => onTo(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Subject
          <input value={subject} onChange={(e) => onSubject(e.target.value)} />
        </label>
        <LetterEditor value={body} onChange={onBody} disabled={busy} />
        {error ? <p className="form-error">{error}</p> : null}
        <footer>
          <button type="button" className="text-btn" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="desk-cta" disabled={!canSend}>
            {busy ? "Sending…" : "Send"}
          </button>
        </footer>
      </form>
      {confirming ? (
        <ConfirmModal
          title="Send this letter?"
          body={`It will go to ${to.trim()} via SMTP. Bateleur will not take it back.`}
          confirmLabel="Send"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onSend();
          }}
        />
      ) : null}
    </div>
  );
}
