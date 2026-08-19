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
  saving?: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
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
  saving = false,
  error,
  onClose,
  onSave,
  onSend,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [bleed, setBleed] = useState(loadComposeBleedPref);
  const [snippets, setSnippets] = useState(loadSnippets);
  const [draftTrigger, setDraftTrigger] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [showCc, setShowCc] = useState(() => cc.trim().length > 0);
  const [showBcc, setShowBcc] = useState(() => bcc.trim().length > 0);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const locked = busy || saving;
  const hasBody = readableText(body).length > 0;
  const canSave =
    accounts.length > 0 &&
    !locked &&
    (to.trim().length > 0 ||
      cc.trim().length > 0 ||
      bcc.trim().length > 0 ||
      subject.trim().length > 0 ||
      hasBody ||
      files.length > 0);
  const canSend =
    accounts.length > 0 && to.trim().length > 0 && hasBody && !locked;

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
        className={
          bleed
            ? `composer composer-bleed${dragging ? " composer-drop" : ""}`
            : `composer${dragging ? " composer-drop" : ""}`
        }
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          setConfirming(true);
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e.dataTransfer)) return;
          e.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = locked ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (locked) return;
          const list = e.dataTransfer.files;
          if (!list?.length) return;
          void addFiles(list, files, onFiles, setAttachNote);
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
          disabled={locked}
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
              disabled={locked}
              onChange={(e) => {
                const list = e.target.files;
                e.target.value = "";
                if (!list) return;
                void addFiles(list, files, onFiles, setAttachNote);
              }}
            />
          </label>
          {files.map((file, index) => (
            <span key={`${file.filename}-${index}`} className="attach-chip">
              {file.filename}
              <span className="muted">{formatSize(approxBytes(file.data))}</span>
              <button
                type="button"
                className="text-btn"
                disabled={locked}
                onClick={() => onFiles(files.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </span>
          ))}
        </div>
        {attachNote ? <p className="form-error">{attachNote}</p> : null}
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
          <button
            type="button"
            className="text-btn"
            disabled={!canSave}
            title="Ctrl+S"
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button type="submit" className="desk-cta" disabled={!canSend}>
            {busy ? "Sending…" : "Send"}
          </button>
        </footer>
      </form>
      {confirming ? (
        <ConfirmModal
          title="Send this letter?"
          body={confirmSendBody(to, cc, bcc, files)}
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

function confirmSendBody(
  to: string,
  cc: string,
  bcc: string,
  files: DraftAttachment[],
): string {
  const dest = sendTargets(to, cc, bcc);
  const names = files.map((file) => file.filename).filter(Boolean);
  const attached =
    names.length === 0
      ? ""
      : names.length === 1
        ? ` Attached: ${names[0]}.`
        : ` Attached: ${names.join(", ")}.`;
  return `It will go to ${dest} via SMTP.${attached} You can undo for a few seconds. After it leaves, you cannot recall it.`;
}

function hasFiles(data: DataTransfer | null): boolean {
  if (!data) return false;
  return [...data.types].includes("Files");
}

async function addFiles(
  list: FileList,
  current: DraftAttachment[],
  onFiles: (files: DraftAttachment[]) => void,
  onNote: (note: string | null) => void,
) {
  const next = [...current];
  const skipped: string[] = [];
  for (const file of [...list]) {
    if (next.length >= MAX_FILES) {
      skipped.push(`At most ${MAX_FILES} files on a letter.`);
      break;
    }
    if (file.size > MAX_BYTES) {
      skipped.push(`“${file.name}” is larger than 8 MB.`);
      continue;
    }
    if (file.size === 0) {
      skipped.push(`“${file.name}” is empty.`);
      continue;
    }
    const data = await readDataUrl(file);
    next.push({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data,
    });
  }
  onFiles(next);
  onNote(skipped[0] ?? null);
}

function approxBytes(data: string): number {
  const payload = data.includes("base64,") ? data.slice(data.indexOf("base64,") + 7) : data;
  return Math.max(0, Math.floor((payload.length * 3) / 4));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
