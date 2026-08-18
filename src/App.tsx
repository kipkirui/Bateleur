import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { addAccount, addAccountOAuth, archiveMessage, hydrateMailbox, isTauri, loadMailbox, mailAlerts as loadMailAlerts, removeAccount, sendMail, setFlag, setMailAlerts, syncAccount } from "./api";
import { readableText } from "./lib/emailHtml";
import { toEditorHtml } from "./components/LetterEditor";
import { Compose } from "./components/Compose";
import { Desk } from "./components/Desk";
import { Feed } from "./components/Feed";
import { Rail } from "./components/Rail";
import { Reader } from "./components/Reader";
import { Settings } from "./components/Settings";
import { StaffModal } from "./components/StaffModal";
import type { AccountDraft, DraftAttachment, FeedId, Mailbox, Message, ReaderMode, SyncStatus } from "./types";
import type { MailTo } from "./lib/links";
import { loadRemoteImagesPref, saveRemoteImagesPref } from "./lib/prefs";
import "./styles.css";

type Overlay = "none" | "reader" | "compose" | "settings" | "staff";

function waitingFor(messages: Message[], accountId: string | null): number {
  return messages.filter((m) => {
    if (m.feed !== "action" || m.folder !== "inbox") return false;
    if (accountId && m.accountId !== accountId) return false;
    return m.unread || m.waitingOn;
  }).length;
}

export default function App() {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedId>("action");
  const [mode, setMode] = useState<ReaderMode>("magazine");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [deskOpen, setDeskOpen] = useState(false);
  const [theme, setTheme] = useState<"day" | "night">("day");
  const [remoteImages, setRemoteImages] = useState(loadRemoteImagesPref);
  const [mailAlerts, setMailAlertsOn] = useState(true);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFromId, setComposeFromId] = useState("");
  const [composeFiles, setComposeFiles] = useState<DraftAttachment[]>([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [settingsNonce, setSettingsNonce] = useState(0);
  const [syncByAccount, setSyncByAccount] = useState<Record<string, SyncStatus>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const seenOnOpen = useRef<string | null>(null);
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;

  const refresh = useCallback((accountFilter: string | null) => {
    return loadMailbox(accountFilter).then(setMailbox);
  }, []);

  useEffect(() => {
    refresh(null).catch(() => {
      setToast("Could not load mailbox");
    });
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!isTauri()) return;
    void loadMailAlerts().then(setMailAlertsOn).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlistenStatus: (() => void) | undefined;
    let unlistenMail: (() => void) | undefined;
    void listen<SyncStatus>("sync-status", (event) => {
      setSyncByAccount((prev) => ({
        ...prev,
        [event.payload.accountId]: event.payload,
      }));
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenStatus = fn;
    });
    void listen<Mailbox>("mailbox-updated", (event) => {
      setMailbox(hydrateMailbox(event.payload, accountIdRef.current));
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenMail = fn;
    });
    return () => {
      cancelled = true;
      unlistenStatus?.();
      unlistenMail?.();
    };
  }, []);

  const messages = mailbox?.messages ?? [];
  const accounts = mailbox?.accounts ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (accountId && m.accountId !== accountId) return false;
      if (feed === "sent" || feed === "drafts" || feed === "junk") {
        return m.folder === feed;
      }
      if (feed.startsWith("custom:")) return m.folder === feed;
      if (m.folder !== "inbox") return false;
      if (m.feed !== feed) return false;
      if (!q || q.startsWith("/")) return true;
      const hay =
        `${readableText(m.fromName)} ${m.fromEmail} ${readableText(m.subject)} ${readableText(m.preview)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [messages, accountId, feed, query]);

  const selected =
    visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
    if (!selected) setSelectedId(null);
  }, [selected, selectedId]);

  const openMailTo = useCallback((mail: MailTo) => {
    setComposeTo(mail.to);
    setComposeSubject(mail.subject);
    setComposeBody(mail.body ? toEditorHtml(mail.body) : "");
    setComposeFromId(accountId ?? accounts[0]?.id ?? "");
    setComposeFiles([]);
    setSendError(null);
    setOverlay("compose");
  }, [accountId, accounts]);

  const openCompose = useCallback((draft?: Partial<Message>) => {
    setComposeTo(draft?.fromEmail ?? "");
    setComposeSubject(draft ? `Re: ${readableText(draft.subject ?? "")}` : "");
    setComposeBody(
      draft
        ? `<p><br></p><blockquote><p>On ${escapeHtml(draft.receivedAt ?? "")}, ${escapeHtml(readableText(draft.fromName ?? ""))} wrote:</p><p>${escapeHtml(readableText(draft.body ?? "")).replace(/\n/g, "<br>")}</p></blockquote>`
        : "",
    );
    setComposeFromId(draft?.accountId ?? accountId ?? accounts[0]?.id ?? "");
    setComposeFiles([]);
    setSendError(null);
    setOverlay("compose");
  }, [accountId, accounts]);

  async function onAddAccount(draft: AccountDraft) {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const next = await addAccount(draft);
      setMailbox(next);
      const live =
        next.accounts.find(
          (a) => a.address.toLowerCase() === draft.address.trim().toLowerCase(),
        ) ?? next.accounts[0];
      if (live) setAccountId(live.id);
      setSettingsNonce((n) => n + 1);
      setToast("Mailbox connected");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccountBusy(false);
    }
  }

  async function onOAuthAccount(
    draft: AccountDraft,
    provider: "google" | "microsoft",
  ) {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const next = await addAccountOAuth(draft, provider);
      setMailbox(next);
      const live =
        next.accounts.find(
          (a) => a.address.toLowerCase() === draft.address.trim().toLowerCase(),
        ) ?? next.accounts[0];
      if (live) setAccountId(live.id);
      setSettingsNonce((n) => n + 1);
      setToast("Mailbox connected");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccountBusy(false);
    }
  }

  async function onSend() {
    const from = composeFromId || accountId || accounts[0]?.id;
    if (!from) {
      setSendError("Add a mailbox in Settings before sending.");
      return;
    }
    setSendBusy(true);
    setSendError(null);
    try {
      const next = await sendMail({
        accountId: from,
        to: composeTo,
        subject: composeSubject,
        body: readableText(composeBody),
        html: composeBody,
        attachments: composeFiles,
        confirm: true,
      });
      setMailbox(next);
      setOverlay("none");
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeFiles([]);
      setFeed("sent");
      setAccountId(from);
      setToast("Sent");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendBusy(false);
    }
  }

  async function onRemoveAccount(id: string) {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const next = await removeAccount(id);
      setMailbox(next);
      if (accountId === id) setAccountId(null);
      if (composeFromId === id) setComposeFromId(next.accounts[0]?.id ?? "");
      setSettingsNonce((n) => n + 1);
      setToast("Mailbox disconnected");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccountBusy(false);
    }
  }

  async function onSync(id: string) {
    try {
      const next = await syncAccount(id);
      setMailbox(next);
      setToast("Synced");
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSetFlag(
    message: Message,
    patch: { seen?: boolean; flagged?: boolean },
  ) {
    try {
      const next = await setFlag({
        accountId: message.accountId,
        messageId: message.id,
        seen: patch.seen,
        flagged: patch.flagged,
      });
      setMailbox(next);
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function onArchive(message: Message) {
    try {
      const next = await archiveMessage(message.accountId, message.id);
      setMailbox(next);
      setOverlay("none");
      setToast("Archived");
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  const move = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = Math.max(
        0,
        visible.findIndex((m) => m.id === selected?.id),
      );
      const next = visible[(index + delta + visible.length) % visible.length];
      setSelectedId(next.id);
    },
    [visible, selected],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openCompose();
        return;
      }
      if (e.key === "Escape") {
        setOverlay("none");
        return;
      }
      if (typing) return;
      if (overlay === "compose" || overlay === "settings" || overlay === "staff") {
        return;
      }
      if (e.key === "j") move(1);
      if (e.key === "k") move(-1);
      if (e.key === "Enter" && selected) setOverlay("reader");
      if (e.key === "c" || e.key === "n") openCompose();
      if (e.key === "r" && selected) openCompose(selected);
      if (e.key === "e" && selected) void onArchive(selected);
      if (e.key === "u" && selected) void onSetFlag(selected, { seen: false });
      if (e.key === "s" && selected) {
        void onSetFlag(selected, { flagged: !selected.flagged });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, openCompose, overlay, selected]);

  useEffect(() => {
    if (overlay !== "reader") {
      seenOnOpen.current = null;
      return;
    }
    if (!selected || seenOnOpen.current === selected.id) return;
    seenOnOpen.current = selected.id;
    if (selected.unread) {
      void onSetFlag(selected, { seen: true });
    }
  }, [overlay, selected]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const emptyLabel =
    accounts.length === 0
      ? "Add a mailbox in Settings to fetch mail."
      : feed === "sent"
        ? "Sent is empty. Letters you confirm-send are copied here on the server."
        : feed === "drafts"
          ? "No drafts on the server yet."
          : feed === "junk"
            ? "Junk is empty."
            : feed.startsWith("custom:")
              ? "Nothing in this folder."
              : query.startsWith("/")
                ? "Staff is off. Commands need a key — Hire staff."
                : "Nothing in this feed.";

  return (
    <div className={deskOpen ? "shell desk-open" : "shell"}>
      <Rail
        accounts={accounts}
        accountId={accountId}
        onAccount={setAccountId}
        feed={feed}
        onFeed={setFeed}
        waiting={waitingFor(messages, accountId)}
        syncLabel={syncLabel(syncByAccount, accountId)}
        folders={mailbox?.folders ?? []}
        mode={mode}
        onMode={setMode}
        onCompose={() => openCompose()}
        onSettings={() => {
          setAccountError(null);
          setOverlay("settings");
        }}
        theme={theme}
        onTheme={() => setTheme((t) => (t === "day" ? "night" : "day"))}
      />
      <Feed
        query={query}
        onQuery={setQuery}
        onCommandHint={() => setToast("Staff is off — Hire staff to paste a key")}
        searchRef={searchRef}
        mode={mode}
        messages={visible}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        onOpen={() => setOverlay("reader")}
        emptyLabel={emptyLabel}
      />
      <Desk
        open={deskOpen}
        onToggle={() => setDeskOpen((v) => !v)}
        onHire={() => {
          setDeskOpen(true);
          setOverlay("staff");
        }}
      />

      {overlay === "reader" && selected ? (
        <Reader
          message={selected}
          account={accounts.find((a) => a.id === selected.accountId)}
          onClose={() => setOverlay("none")}
          onReply={() => openCompose(selected)}
          onUnread={() => void onSetFlag(selected, { seen: false })}
          onFlag={() => void onSetFlag(selected, { flagged: !selected.flagged })}
          onArchive={() => void onArchive(selected)}
          onMailTo={openMailTo}
          remoteImages={remoteImages}
          onRemoteImages={(on) => {
            setRemoteImages(on);
            saveRemoteImagesPref(on);
          }}
        />
      ) : null}

      {overlay === "compose" ? (
        <Compose
          accounts={accounts}
          fromId={composeFromId || accounts[0]?.id || ""}
          onFrom={setComposeFromId}
          to={composeTo}
          subject={composeSubject}
          body={composeBody}
          onTo={setComposeTo}
          onSubject={setComposeSubject}
          onBody={setComposeBody}
          files={composeFiles}
          onFiles={setComposeFiles}
          busy={sendBusy}
          error={sendError}
          onClose={() => {
            setOverlay("none");
            setComposeFiles([]);
          }}
          onSend={() => void onSend()}
        />
      ) : null}

      {overlay === "settings" ? (
        <Settings
          key={settingsNonce}
          accounts={accounts}
          busy={accountBusy}
          error={accountError}
          onClose={() => setOverlay("none")}
          onAdd={onAddAccount}
          onOAuth={onOAuthAccount}
          onSync={onSync}
          onRemove={onRemoveAccount}
          removing={accountBusy}
          remoteImages={remoteImages}
          onRemoteImages={(on) => {
            setRemoteImages(on);
            saveRemoteImagesPref(on);
          }}
          mailAlerts={mailAlerts}
          onMailAlerts={(on) => {
            setMailAlertsOn(on);
            void setMailAlerts(on).catch(() => {});
          }}
        />
      ) : null}

      {overlay === "staff" ? (
        <StaffModal onClose={() => setOverlay("none")} />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function syncLabel(
  byAccount: Record<string, SyncStatus>,
  accountId: string | null,
): string {
  const rows = accountId
    ? [byAccount[accountId]].filter(Boolean)
    : Object.values(byAccount);
  if (rows.some((row) => row.state === "syncing")) return "Syncing";
  if (rows.some((row) => row.state === "error")) return "Sync failed";
  if (rows.some((row) => row.state === "watching")) return "Watching";
  const times = rows
    .map((row) => row.at)
    .filter((at): at is string => Boolean(at))
    .sort();
  const stamped = times[times.length - 1];
  if (stamped) return `Synced ${formatAgo(stamped)}`;
  return "";
}

function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 20_000) return "just now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
