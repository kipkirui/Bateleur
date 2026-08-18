import { useEffect, useState } from "react";
import { readableText } from "../lib/emailHtml";
import { loadComposeBleedPref, saveComposeBleedPref } from "../lib/prefs";
import { quoteHeading, type ComposeQuote } from "../lib/quote";
import {
  loadSnippets,
  normalizeTrigger,
  saveSnippets,
} from "../lib/snippets";
import type { Account, DraftAttachment } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { LetterEditor } from "./LetterEditor";

type Props = {
  heading?: string;
  accounts: Account[];
  fromId: string;
  onFrom: (id: string) => void;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  onTo: (value: string) => void;
  onCc: (value: string) => void;
  onBcc: (value: string) => void;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  files: DraftAttachment[];
  onFiles: (files: DraftAttachment[]) => void;
  quote: ComposeQuote | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSend: () => void;
};

export function Compose({
  heading = "New letter",
  accounts,
  fromId,
  onFrom,
  to,
  cc,
  bcc,
  subject,
  body,
  onTo,
  onCc,
  onBcc,
  onSubject,
  onBody,
  files,
  onFiles,
  quote,
  busy,
  error,
  onClose,
  onSend,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [bleed, setBleed] = useState(loadComposeBleedPref);
  const [snippets, setSnippets] = useState(loadSnippets);
  const [draftTrigger, setDraftTrigger] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [showCc, setShowCc] = useState(() => cc.trim().length > 0);
  const [showBcc, setShowBcc] = useState(() => bcc.trim().length > 0);
  const hasBody = readableText(body).length > 0;
  const canSend =
    accounts.length > 0 && to.trim().length > 0 && hasBody && !busy;

  useEffect(() => {
    if (cc.trim()) setShowCc(true);
    if (bcc.trim()) setShowBcc(true);
  }, [cc, bcc]);

  function toggleBleed() {
    const next = !bleed;
    setBleed(next);
    saveComposeBleedPref(next);
  }

  function addSnippet() {
    const trigger = normalizeTrigger(draftTrigger);
    const text = draftBody.trim();
    if (!trigger || !text) return;
    const next = [
      ...snippets.filter((row) => row.trigger !== trigger),
      { id: trigger, trigger, body: text },
    ];
    setSnippets(next);
    saveSnippets(next);
    setDraftTrigger("");
    setDraftBody("");
  }

  function removeSnippet(id: string) {
    const next = snippets.filter((row) => row.id !== id);
    setSnippets(next);
    saveSnippets(next);
  }

  return (
    <div className={bleed ? "overlay overlay-bleed" : "overlay"} role="dialog" aria-modal="true">
      <form
        className={bleed ? "composer composer-bleed" : "composer"}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          setConfirming(true);
        }}
      >
        <header>
          <span>{heading}</span>
          <span className="composer-head-actions">
            <button type="button" className="text-btn" onClick={toggleBleed}>
              {bleed ? "Exit focus" : "Focus"}
            </button>
            <button type="button" className="text-btn" onClick={onClose}>
              Close
            </button>
          </span>
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
        {showCc ? (
          <label>
            Cc
            <input
              value={cc}
              onChange={(e) => onCc(e.target.value)}
              autoComplete="email"
            />
          </label>
        ) : null}
        {showBcc ? (
          <label>
            Bcc
            <input
              value={bcc}
              onChange={(e) => onBcc(e.target.value)}
              autoComplete="email"
            />
          </label>
        ) : null}
        {!showCc || !showBcc ? (
          <div className="compose-copy">
            {!showCc ? (
              <button type="button" className="text-btn" onClick={() => setShowCc(true)}>
                Cc
              </button>
            ) : null}
            {!showBcc ? (
              <button type="button" className="text-btn" onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            ) : null}
          </div>
        ) : null}
        <label>
          Subject
          <input value={subject} onChange={(e) => onSubject(e.target.value)} />
        </label>
        <LetterEditor
          value={body}
          onChange={onBody}
          disabled={busy}
          snippets={snippets}
        />
        {quote ? (
          <details className="compose-quote">
            <summary>{quoteHeading(quote)}</summary>
            <blockquote>{quote.body}</blockquote>
          </details>
        ) : null}
        <div className="attach-compose">
          <label className="text-btn attach-picker">
            Attach
            <input
              type="file"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                const list = e.target.files;
                e.target.value = "";
                if (!list) return;
                void addFiles(list, files, onFiles);
              }}
            />
          </label>
          {files.map((file, index) => (
            <span key={`${file.filename}-${index}`} className="attach-chip">
              {file.filename}
              <button
                type="button"
                className="text-btn"
                disabled={busy}
                onClick={() => onFiles(files.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </span>
          ))}
        </div>
        <details className="compose-snippets">
          <summary>Snippets</summary>
          <p className="muted">
            Type <kbd>::thanks</kbd> or <kbd>/followup</kbd> in the letter. Stored on this
            machine only.
          </p>
          <ul>
            {snippets.map((snippet) => (
              <li key={snippet.id}>
                <kbd>::{snippet.trigger}</kbd>
                <span>{snippet.body}</span>
                <button type="button" className="text-btn" onClick={() => removeSnippet(snippet.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="snippet-add">
            <input
              value={draftTrigger}
              onChange={(e) => setDraftTrigger(e.target.value)}
              placeholder="trigger"
              aria-label="Snippet trigger"
            />
            <input
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="Thanks for reaching out,"
              aria-label="Snippet text"
            />
            <button type="button" className="text-btn" onClick={addSnippet}>
              Add
            </button>
          </div>
        </details>
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
          body={`It will go to ${sendTargets(to, cc, bcc)} via SMTP. Bateleur will not take it back.`}
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

const MAX_FILES = 8;
const MAX_BYTES = 8 * 1024 * 1024;

function sendTargets(to: string, cc: string, bcc: string): string {
  const parts = [`To ${to.trim()}`];
  if (cc.trim()) parts.push(`Cc ${cc.trim()}`);
  if (bcc.trim()) parts.push(`Bcc ${bcc.trim()}`);
  return parts.join("; ");
}

async function addFiles(
  list: FileList,
  current: DraftAttachment[],
  onFiles: (files: DraftAttachment[]) => void,
) {
  const next = [...current];
  for (const file of [...list]) {
    if (next.length >= MAX_FILES) break;
    if (file.size > MAX_BYTES) continue;
    const data = await readDataUrl(file);
    next.push({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data,
    });
  }
  onFiles(next);
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
