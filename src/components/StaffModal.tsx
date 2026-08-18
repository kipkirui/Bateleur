import { useEffect, useState } from "react";
import { clearStaff, saveStaff, staffStatus } from "../api";
import {
  defaultStaffModel,
  loadStaffEndpoint,
  loadStaffProvider,
  type StaffProvider,
} from "../lib/prefs";
import type { StaffStatus } from "../types";
import { SecretField } from "./SecretField";

type Props = {
  onClose: () => void;
  onChange: (status: StaffStatus) => void;
};

const PROVIDERS: { id: StaffProvider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "compatible", label: "Compatible endpoint" },
];

export function StaffModal({ onClose, onChange }: Props) {
  const [provider, setProvider] = useState<StaffProvider>("openai");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [summarize, setSummarize] = useState(false);
  const [summarizeAccount, setSummarizeAccount] = useState(false);
  const [summarizeNew, setSummarizeNew] = useState(false);
  const [drafts, setDrafts] = useState(false);
  const [hired, setHired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void staffStatus()
      .then((status) => {
        if (cancelled) return;
        applyStatus(status);
        if (!status.hired) {
          const local = loadStaffProvider();
          if (status.provider === "openai" && local !== "openai") {
            setProvider(local);
          }
          const saved = loadStaffEndpoint();
          if (!status.endpoint && saved) setEndpoint(saved);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyStatus(status: StaffStatus) {
    setHired(status.hired);
    setProvider(status.provider);
    setModel(status.model);
    setEndpoint(status.endpoint);
    setSummarize(status.summarize);
    setSummarizeAccount(status.summarizeAccount);
    setSummarizeNew(status.summarizeNew);
    setDrafts(status.drafts);
    onChange(status);
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const status = await saveStaff({
        provider,
        model,
        endpoint,
        key: apiKey,
        summarize,
        summarizeAccount,
        summarizeNew,
        drafts,
      });
      applyStatus(status);
      setApiKey("");
      setNote(
        status.summarize || status.summarizeAccount || status.summarizeNew || status.drafts
          ? "Staff is hired. Open a letter or write the Brief from the desk."
          : "Key stored. Turn on a capability to run.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDismiss() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const status = await clearStaff();
      applyStatus(status);
      setApiKey("");
      setNote("Staff dismissed. Mail still works.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="settings staff-modal">
        <header>
          <h1>{hired ? "Staff" : "Hire staff"}</h1>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p>
          Bring your own key. We do not sell tokens and we do not proxy
          inference. Nothing runs until a capability is on and a key is present.
          The body of a letter goes only to the provider you pick.
        </p>
        <label>
          Provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as StaffProvider)}
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {provider === "compatible" ? (
          <label>
            Endpoint
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://localhost:11434/v1"
              autoComplete="off"
            />
          </label>
        ) : null}
        <label>
          Model
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={defaultStaffModel(provider)}
            autoComplete="off"
          />
        </label>
        <label>
          API key
          <SecretField
            value={apiKey}
            onChange={setApiKey}
            placeholder={
              hired
                ? "Stored in the OS keychain — paste to replace"
                : "Paste a key — stored in the OS keychain"
            }
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={summarize}
            onChange={(event) => setSummarize(event.target.checked)}
          />
          Summarize this message
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={summarizeAccount}
            onChange={(event) => setSummarizeAccount(event.target.checked)}
          />
          Summarize this account (Morning Brief)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={summarizeNew}
            onChange={(event) => setSummarizeNew(event.target.checked)}
          />
          Summarize all new mail (on sync)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={drafts}
            onChange={(event) => setDrafts(event.target.checked)}
          />
          Generate drafts (never send)
        </label>
        {error ? <p className="muted staff-error">{error}</p> : null}
        {note ? <p className="muted">{note}</p> : null}
        <footer className="staff-actions">
          {hired ? (
            <button
              type="button"
              className="text-btn"
              disabled={busy}
              onClick={() => void onDismiss()}
            >
              Dismiss staff
            </button>
          ) : (
            <span className="muted">Mail works without staff.</span>
          )}
          <button
            type="button"
            className="desk-cta"
            disabled={busy}
            onClick={() => void onSave()}
          >
            {busy ? "Saving…" : hired ? "Update" : "Hire"}
          </button>
        </footer>
      </div>
    </div>
  );
}
