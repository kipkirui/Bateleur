import { useState } from "react";
import { SecretField } from "./SecretField";

type Props = {
  onClose: () => void;
};

export function StaffModal({ onClose }: Props) {
  const [apiKey, setApiKey] = useState("");

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
          <select defaultValue="openai" disabled>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
            <option value="openrouter">OpenRouter</option>
            <option value="compatible">Compatible endpoint</option>
          </select>
        </label>
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
          Staff does not run yet. Paste a key here when that ships — mail still
          works without it.
        </p>
      </div>
    </div>
  );
}
