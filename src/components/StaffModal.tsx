import { useState } from "react";
import {
  loadStaffEndpoint,
  loadStaffProvider,
  saveStaffEndpoint,
  saveStaffProvider,
  type StaffProvider,
} from "../lib/prefs";
import { SecretField } from "./SecretField";

type Props = {
  onClose: () => void;
};

const PROVIDERS: { id: StaffProvider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "compatible", label: "Compatible endpoint" },
];

export function StaffModal({ onClose }: Props) {
  const [provider, setProvider] = useState(loadStaffProvider);
  const [endpoint, setEndpoint] = useState(loadStaffEndpoint);
  const [apiKey, setApiKey] = useState("");

  function onProvider(next: StaffProvider) {
    setProvider(next);
    saveStaffProvider(next);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="settings staff-modal">
        <header>
          <h1>Hire staff</h1>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p>
          Bring your own key. We do not sell tokens and we do not proxy
          inference. Nothing runs until a capability is on and a key is present.
        </p>
        <label>
          Provider
          <select
            value={provider}
            onChange={(event) => onProvider(event.target.value as StaffProvider)}
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
              onChange={(event) => {
                setEndpoint(event.target.value);
                saveStaffEndpoint(event.target.value);
              }}
              placeholder="https://localhost:11434/v1"
              autoComplete="off"
            />
          </label>
        ) : null}
        <label>
          API key
          <SecretField
            value={apiKey}
            onChange={setApiKey}
            placeholder="Paste later — stored in the OS keychain"
          />
        </label>
        <label className="check">
          <input type="checkbox" disabled />
          Summarize this message
        </label>
        <label className="check">
          <input type="checkbox" disabled />
          Generate drafts (never send)
        </label>
        <p className="muted">
          Pick a provider now. Summaries and drafts still do not run — the key
          is not stored until that ships. Mail works without staff.
        </p>
      </div>
    </div>
  );
}
