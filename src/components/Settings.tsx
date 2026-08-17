import { useEffect, useState } from "react";
import { guessServers } from "../api";
import { SecretField } from "./SecretField";
import { ConfirmModal } from "./ConfirmModal";
import type { Account, AccountDraft, ServerGuess } from "../types";

type Props = {
  accounts: Account[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAdd: (draft: AccountDraft) => void;
  onSync: (accountId: string) => void;
  onRemove: (accountId: string) => void;
  removing?: boolean;
  remoteImages: boolean;
  onRemoteImages: (on: boolean) => void;
};

export function Settings({
  accounts,
  busy,
  error,
  onClose,
  onAdd,
  onSync,
  onRemove,
  removing = false,
  remoteImages,
  onRemoteImages,
}: Props) {
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"imap" | "pop">("imap");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapUser, setImapUser] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [trustTls, setTrustTls] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Account | null>(null);
  const [guess, setGuess] = useState<ServerGuess | null>(null);

  useEffect(() => {
    const trimmed = address.trim();
    if (!trimmed.includes("@")) return;
    const handle = window.setTimeout(() => {
      guessServers(trimmed).then((next) => {
        if (!next) return;
        setGuess(next);
      });
    }, 280);
    return () => window.clearTimeout(handle);
  }, [address]);

  useEffect(() => {
    if (!guess) return;
    if (kind === "pop") {
      setImapHost(guess.popHost);
      setImapPort(guess.popPort);
    } else {
      setImapHost(guess.imapHost);
      setImapPort(guess.imapPort);
    }
    setImapUser(guess.username);
    setSmtpHost(guess.smtpHost);
    setSmtpPort(guess.smtpPort);
    setSmtpUser(guess.username);
  }, [guess, kind]);

  useEffect(() => {
    if (guess) return;
    setImapPort((port) => {
      if (kind === "pop" && port === 993) return 995;
      if (kind === "imap" && port === 995) return 993;
      return port;
    });
  }, [kind, guess]);

  useEffect(() => {
    if (error && /unknownissuer|certificate|tls/i.test(error)) {
      setTrustTls(true);
    }
  }, [error]);

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="settings">
        <header>
          <h1>Settings</h1>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="settings-section">
          <h2>Mail</h2>
          <p>
            Add any IMAP or POP mailbox, like a desktop client. Password is
            stored in the OS keychain, never in SQLite. Gmail and Outlook need
            an app password. POP has no server folders — mail is ingested into
            the local inbox and left on the server.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={remoteImages}
              onChange={(e) => onRemoteImages(e.target.checked)}
            />
            Load remote images in letters
          </label>

          <div className="account-list">
            {accounts.length === 0 ? (
              <p className="muted">No mailboxes yet.</p>
            ) : (
              accounts.map((account) => (
                <div key={account.id} className="account-row">
                  <div>
                    <strong>{account.label}</strong>
                    <span className="nav-meta">
                      {account.kind === "pop" ? "POP" : "IMAP"} · {account.address}
                    </span>
                  </div>
                  <div className="account-actions">
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => onSync(account.id)}
                    >
                      Sync
                    </button>
                    <button
                      type="button"
                      className="text-btn danger-text"
                      onClick={() => setPendingRemove(account)}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <h3>Add a mailbox</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd({
                address,
                password,
                label,
                kind,
                imapHost,
                imapPort,
                imapUser,
                smtpHost,
                smtpPort,
                smtpUser,
                trustTls,
              });
            }}
          >
            <label>
              Email
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <SecretField
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
            </label>
            {address.toLowerCase().includes("@gmail.")
            || address.toLowerCase().includes("@googlemail.") ? (
              <p className="muted">
                Gmail will reject your normal Google password. Create a 16-letter
                App password at myaccount.google.com/apppasswords (2-Step
                Verification must be on), and enable {kind === "pop" ? "POP" : "IMAP"}{" "}
                in Gmail settings. Spaces in the app password are fine.
              </p>
            ) : null}
            <label>
              Label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Work"
              />
            </label>
            <label>
              Protocol
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "imap" | "pop")}
              >
                <option value="imap">IMAP</option>
                <option value="pop">POP</option>
              </select>
            </label>
            <h3>Servers</h3>
            <div className="server-grid">
              <label>
                {kind === "pop" ? "POP host" : "IMAP host"}
                <input
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                />
              </label>
              <label>
                Port
                <input
                  type="number"
                  value={imapPort}
                  onChange={(e) => setImapPort(Number(e.target.value))}
                />
              </label>
              <label>
                {kind === "pop" ? "POP username" : "IMAP username"}
                <input
                  value={imapUser}
                  onChange={(e) => setImapUser(e.target.value)}
                />
              </label>
              <label>
                SMTP host
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                />
              </label>
              <label>
                Port
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                />
              </label>
              <label>
                SMTP username
                <input
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={trustTls}
                onChange={(e) => setTrustTls(e.target.checked)}
              />
              Trust this server&apos;s certificate (self-signed or missing CA chain)
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <footer className="form-footer">
              <button type="submit" className="desk-cta" disabled={busy}>
                {busy ? "Connecting…" : "Connect and fetch"}
              </button>
            </footer>
          </form>
        </section>
      </div>
      {pendingRemove ? (
        <ConfirmModal
          title="Disconnect this mailbox?"
          body={`${pendingRemove.address} will be removed from Bateleur. Cached mail and the keychain password leave this computer. The mailbox on the server is not deleted.`}
          confirmLabel="Disconnect"
          danger
          busy={removing}
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => onRemove(pendingRemove.id)}
        />
      ) : null}
    </div>
  );
}
