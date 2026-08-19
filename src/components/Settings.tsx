import { useEffect, useState } from "react";
import { guessServers, oauthStatus, saveOAuthClients } from "../api";
import { SecretField } from "./SecretField";
import { ConfirmModal } from "./ConfirmModal";
import type { Account, AccountDraft, OAuthStatus, ServerGuess } from "../types";

type Props = {
  accounts: Account[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAdd: (draft: AccountDraft) => void;
  onOAuth: (draft: AccountDraft, provider: "google" | "microsoft") => void;
  onSync: (accountId: string) => void;
  onRemove: (accountId: string) => void;
  removing?: boolean;
  remoteImages: boolean;
  onRemoteImages: (on: boolean) => void;
  mailAlerts: boolean;
  onMailAlerts: (on: boolean) => void;
  checkUpdates: boolean;
  onCheckUpdates: (on: boolean) => void;
};

export function Settings({
  accounts,
  busy,
  error,
  onClose,
  onAdd,
  onOAuth,
  onSync,
  onRemove,
  removing = false,
  remoteImages,
  onRemoteImages,
  mailAlerts,
  onMailAlerts,
  checkUpdates,
  onCheckUpdates,
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
  const [oauth, setOauth] = useState<OAuthStatus>({
    google: false,
    microsoft: false,
    googleClientId: "",
    googleClientSecret: "",
    microsoftClientId: "",
  });
  const [googleClient, setGoogleClient] = useState("");
  const [googleSecret, setGoogleSecret] = useState("");
  const [microsoftClient, setMicrosoftClient] = useState("");
  const [clientNote, setClientNote] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "microsoft" | null>(null);

  useEffect(() => {
    oauthStatus().then((status) => {
      setOauth(status);
      setGoogleClient(status.googleClientId);
      setGoogleSecret(status.googleClientSecret);
      setMicrosoftClient(status.microsoftClientId);
    });
  }, []);

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

  useEffect(() => {
    if (!busy) setOauthPending(null);
  }, [busy]);

  function draft(): AccountDraft {
    return {
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
    };
  }

  async function startOAuth(provider: "google" | "microsoft") {
    if (!address.trim().includes("@")) {
      onOAuth(draft(), provider);
      return;
    }
    setOauthPending(provider);
    try {
      if (
        googleClient.trim() !== oauth.googleClientId ||
        googleSecret.trim() !== oauth.googleClientSecret ||
        microsoftClient.trim() !== oauth.microsoftClientId
      ) {
        const status = await saveOAuthClients(googleClient, googleSecret, microsoftClient);
        setOauth(status);
        setClientNote("Client IDs saved on this computer.");
      }
    } catch (err) {
      setOauthPending(null);
      setClientNote(err instanceof Error ? err.message : String(err));
      return;
    }
    onOAuth(draft(), provider);
  }

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
            Add any IMAP or POP mailbox. App passwords still work. Gmail and
            Outlook can Sign in with Google or Microsoft (IMAP/SMTP with
            XOAUTH2 — not the Gmail API or Microsoft Graph). Tokens and
            passwords stay in the OS keychain. POP has no server folders — mail
            is ingested into the local inbox and left on the server.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={remoteImages}
              onChange={(e) => onRemoteImages(e.target.checked)}
            />
            Load remote images in letters
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={mailAlerts}
              onChange={(e) => onMailAlerts(e.target.checked)}
            />
            Notify when new mail arrives
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={checkUpdates}
              onChange={(e) => onCheckUpdates(e.target.checked)}
            />
            Check GitHub for Bateleur updates
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
                      {account.kind === "pop" ? "POP" : "IMAP"}
                      {account.auth === "xoauth2" ? " · OAuth" : ""} · {account.address}
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
              onAdd(draft());
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
              />
            </label>
            {address.toLowerCase().includes("@gmail.")
            || address.toLowerCase().includes("@googlemail.") ? (
              <p className="muted">
                Gmail will reject your normal Google password. Use Sign in with
                Google, or a 16-letter App password at
                myaccount.google.com/apppasswords (2-Step Verification must be
                on), and enable {kind === "pop" ? "POP" : "IMAP"} in Gmail
                settings. Spaces in the app password are fine.
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
            <p className="muted">
              Sign in uses the address above. A password is not needed. Paste the
              client IDs below if you have not already.
            </p>
            <div className="oauth-row">
              <button
                type="button"
                className="desk-cta"
                disabled={busy}
                onClick={() => void startOAuth("google")}
              >
                {oauthPending === "google" ? "Waiting for browser…" : "Sign in with Google"}
              </button>
              <button
                type="button"
                className="desk-cta"
                disabled={busy}
                onClick={() => void startOAuth("microsoft")}
              >
                {oauthPending === "microsoft"
                  ? "Waiting for browser…"
                  : "Sign in with Microsoft"}
              </button>
            </div>
            <footer className="form-footer">
              <button type="submit" className="desk-cta" disabled={busy}>
                {busy ? "Connecting…" : "Connect and fetch"}
              </button>
            </footer>
          </form>

          <h3>OAuth client IDs</h3>
          <p className="muted">
            Needed once so Sign in can open Google or Microsoft. You can also set{" "}
            <code>BATELEUR_GOOGLE_OAUTH_CLIENT_ID</code>,{" "}
            <code>BATELEUR_GOOGLE_OAUTH_CLIENT_SECRET</code>, and{" "}
            <code>BATELEUR_MICROSOFT_OAUTH_CLIENT_ID</code>.
          </p>
          <p className="muted">
            Google: APIs &amp; Services → Credentials → OAuth client ID → Desktop
            app. Paste the client ID and the client secret. Google still issues a
            secret for Desktop apps, and the token host requires it.
          </p>
          <p className="muted">
            Microsoft: Azure → App registrations → New registration. Authentication
            → Add a platform → <strong>Mobile and desktop applications</strong>.
            Redirect URI <code>http://localhost</code> — not Web, not SPA, and not
            only the suggested nativeclient URL. Allow public client flows: Yes.
            Then paste the Application (client) ID below.
          </p>
          <label>
            Google client ID
            <input
              value={googleClient}
              onChange={(e) => setGoogleClient(e.target.value)}
              placeholder="….apps.googleusercontent.com"
              autoComplete="off"
            />
          </label>
          <label>
            Google client secret
            <SecretField
              value={googleSecret}
              onChange={setGoogleSecret}
              placeholder="Desktop client secret"
              autoComplete="off"
            />
          </label>
          <label>
            Microsoft application ID
            <input
              value={microsoftClient}
              onChange={(e) => setMicrosoftClient(e.target.value)}
              placeholder="Azure app (client) ID"
              autoComplete="off"
            />
          </label>
          {clientNote ? <p className="muted">{clientNote}</p> : null}
          {!oauth.google && !oauth.microsoft ? (
            <p className="muted">
              Sign in is off until a client ID is saved. Google also needs its
              client secret. App passwords still work.
            </p>
          ) : null}
          <footer className="form-footer">
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                saveOAuthClients(googleClient, googleSecret, microsoftClient)
                  .then((status) => {
                    setOauth(status);
                    setClientNote("Client IDs saved on this computer.");
                  })
                  .catch((err: unknown) => {
                    setClientNote(
                      err instanceof Error ? err.message : String(err),
                    );
                  });
              }}
            >
              Save client IDs
            </button>
          </footer>
        </section>
      </div>
      {pendingRemove ? (
        <ConfirmModal
          title="Disconnect this mailbox?"
          body={`${pendingRemove.address} will be removed from Bateleur. Cached mail and the keychain password or OAuth tokens leave this computer. The mailbox on the server is not deleted.`}
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
