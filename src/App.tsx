import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { addAccount, addAccountOAuth, archiveMessage, hydrateMailbox, isTauri, loadMailbox, lockSenderReading, mailAlerts as loadMailAlerts, moveToReading, removeAccount, resetSender, sendMail, setFlag, setMailAlerts, syncAccount } from "./api";
import { readableText } from "./lib/emailHtml";
import { toEditorHtml } from "./components/LetterEditor";
import { Compose } from "./components/Compose";
import { Desk } from "./components/Desk";
import { Feed } from "./components/Feed";
import { Rail } from "./components/Rail";
import { Reader } from "./components/Reader";
import { Settings } from "./components/Settings";
import { SenderPage } from "./components/SenderPage";
import { StaffModal } from "./components/StaffModal";
import type { AccountDraft, DraftAttachment, FeedId, FlagChange, Mailbox, Message, ReaderMode, SendDraft, SyncStatus } from "./types";
import type { MailTo } from "./lib/links";
import { loadRemoteImagesPref, saveRemoteImagesPref } from "./lib/prefs";
import { UNDO_MS, archiveLabel, flagLabel } from "./lib/undo";
import "./styles.css";

type Overlay = "none" | "reader" | "compose" | "settings" | "staff" | "sender";

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
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
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
  const [canUndo, setCanUndo] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [settingsNonce, setSettingsNonce] = useState(0);
  const [syncByAccount, setSyncByAccount] = useState<Record<string, SyncStatus>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const seenOnOpen = useRef<string | null>(null);
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const archiveQueue = useRef<Message[]>([]);
  const archiveTimer = useRef(0);
  const sendTimer = useRef(0);
  const pendingSend = useRef<SendDraft | null>(null);
  const flagUndo = useRef<FlagChange[] | null>(null);
  const undoKind = useRef<"archive" | "flag" | "send" | null>(null);

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
      if (hiddenIds.has(m.id)) return false;
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
  }, [messages, accountId, feed, query, hiddenIds]);

  const selected =
    messages.find((m) => m.id === selectedId) ?? visible[0] ?? null;

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
    const draft: SendDraft = {
      accountId: from,
      to: composeTo,
      subject: composeSubject,
      body: readableText(composeBody),
      html: composeBody,
      attachments: composeFiles,
      confirm: true,
    };
    setSendBusy(false);
    setSendError(null);
    await flushArchive();
    pendingSend.current = draft;
    undoKind.current = "send";
    flagUndo.current = null;
    setOverlay("none");
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeFiles([]);
    setCanUndo(true);
    setToast("Sending");
    window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => {
      void commitSend();
    }, UNDO_MS);
  }

  function restoreCompose(draft: SendDraft) {
    setComposeTo(draft.to);
    setComposeSubject(draft.subject);
    setComposeBody(draft.html || draft.body);
    setComposeFromId(draft.accountId);
    setComposeFiles(draft.attachments ?? []);
    setSendError(null);
    setOverlay("compose");
  }

  async function commitSend() {
    window.clearTimeout(sendTimer.current);
    const draft = pendingSend.current;
    pendingSend.current = null;
    if (undoKind.current === "send") {
      undoKind.current = null;
      setCanUndo(false);
    }
    if (!draft) return;
    setSendBusy(true);
    try {
      const next = await sendMail(draft);
      setMailbox(next);
      setFeed("sent");
      setAccountId(draft.accountId);
      setToast("Sent");
    } catch (err) {
      restoreCompose(draft);
      setSendError(err instanceof Error ? err.message : String(err));
      setToast("Send failed");
    } finally {
      setSendBusy(false);
    }
  }

  async function flushArchive() {
    window.clearTimeout(archiveTimer.current);
    const batch = archiveQueue.current;
    archiveQueue.current = [];
    if (undoKind.current === "archive") {
      undoKind.current = null;
      setCanUndo(false);
    }
    if (batch.length === 0) return;
    try {
      let next = mailbox;
      for (const message of batch) {
        next = await archiveMessage(message.accountId, message.id);
      }
      if (next) setMailbox(next);
    } catch (err) {
      setHiddenIds((prev) => {
        const copy = new Set(prev);
        for (const message of batch) copy.delete(message.id);
        return copy;
      });
      setToast(err instanceof Error ? err.message : String(err));
      return;
    }
    setHiddenIds((prev) => {
      const copy = new Set(prev);
      for (const message of batch) copy.delete(message.id);
      return copy;
    });
  }

  function queueArchive(list: Message[]) {
    const extra = list.filter(
      (message) => !archiveQueue.current.some((queued) => queued.id === message.id),
    );
    if (extra.length === 0 && archiveQueue.current.length === 0 && list.length === 0) return;
    if (undoKind.current === "send") {
      void commitSend().then(() => queueArchive(list));
      return;
    }
    if (undoKind.current === "flag") {
      flagUndo.current = null;
    }
    archiveQueue.current = [...archiveQueue.current, ...extra];
    setHiddenIds((prev) => {
      const copy = new Set(prev);
      for (const message of extra) copy.add(message.id);
      return copy;
    });
    if (overlay === "reader") setOverlay("none");
    setCheckedIds(new Set());
    undoKind.current = "archive";
    flagUndo.current = null;
    window.clearTimeout(archiveTimer.current);
    setCanUndo(true);
    setToast(archiveLabel(archiveQueue.current.length));
    archiveTimer.current = window.setTimeout(() => {
      void flushArchive();
    }, UNDO_MS);
  }

  async function applyFlags(
    items: { message: Message; patch: { seen?: boolean; flagged?: boolean } }[],
    silent = false,
  ) {
    if (items.length === 0) return;
    if (!silent) {
      if (undoKind.current === "archive") await flushArchive();
      if (undoKind.current === "send") await commitSend();
    }
    const reverse: FlagChange[] = items.map(({ message, patch }) => ({
      accountId: message.accountId,
      messageId: message.id,
      seen: patch.seen === undefined ? null : !patch.seen,
      flagged: patch.flagged === undefined ? null : !patch.flagged,
    }));
    try {
      let next = mailbox;
      for (const { message, patch } of items) {
        next = await setFlag({
          accountId: message.accountId,
          messageId: message.id,
          seen: patch.seen,
          flagged: patch.flagged,
        });
      }
      if (next) setMailbox(next);
      if (silent) return;
      flagUndo.current = reverse;
      undoKind.current = "flag";
      setCanUndo(true);
      const flagged = items[0]?.patch.flagged;
      const seen = items[0]?.patch.seen;
      setToast(
        flagged !== undefined
          ? flagLabel(items.length, flagged)
          : seen === false
            ? items.length === 1
              ? "Marked unread"
              : `Marked ${items.length} unread`
            : "Updated",
      );
    } catch (err) {
      if (!silent) setCanUndo(false);
      setToast(err instanceof Error ? err.message : String(err));
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
    const silent = patch.seen === true && patch.flagged === undefined;
    await applyFlags([{ message, patch }], silent);
  }

  function onArchive(message: Message) {
    queueArchive([message]);
  }

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function checkedMessages(): Message[] {
    if (checkedIds.size === 0) return [];
    return messages.filter((m) => checkedIds.has(m.id) && !hiddenIds.has(m.id));
  }

  function actionTargets(): Message[] {
    const checked = checkedMessages();
    if (checked.length > 0) return checked;
    return selected && !hiddenIds.has(selected.id) ? [selected] : [];
  }

  function bulkArchive() {
    queueArchive(actionTargets());
  }

  function bulkFlag() {
    const targets = actionTargets();
    if (targets.length === 0) return;
    const on = targets.some((m) => !m.flagged);
    void applyFlags(targets.map((message) => ({ message, patch: { flagged: on } })));
    setCheckedIds(new Set());
  }

  function onUndo() {
    if (undoKind.current === "archive") {
      window.clearTimeout(archiveTimer.current);
      const batch = archiveQueue.current;
      archiveQueue.current = [];
      undoKind.current = null;
      setHiddenIds((prev) => {
        const copy = new Set(prev);
        for (const message of batch) copy.delete(message.id);
        return copy;
      });
      setCanUndo(false);
      setToast("Restored");
      return;
    }
    if (undoKind.current === "send") {
      window.clearTimeout(sendTimer.current);
      const draft = pendingSend.current;
      pendingSend.current = null;
      undoKind.current = null;
      setCanUndo(false);
      if (draft) restoreCompose(draft);
      setToast("Send cancelled");
      return;
    }
    if (undoKind.current === "flag" && flagUndo.current) {
      const reverse = flagUndo.current;
      flagUndo.current = null;
      undoKind.current = null;
      setCanUndo(false);
      void (async () => {
        try {
          let next = mailbox;
          for (const change of reverse) {
            next = await setFlag(change);
          }
          if (next) setMailbox(next);
          setToast("Restored");
        } catch (err) {
          setToast(err instanceof Error ? err.message : String(err));
        }
      })();
    }
  }

  async function onReading(message: Message) {
    try {
      const next = await moveToReading(message.id);
      setMailbox(next);
      setToast("Moved to Reading");
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  function openSender(message: Message) {
    setSenderEmail(message.fromEmail);
    setOverlay("sender");
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
        if (checkedIds.size > 0 && overlay === "none") {
          setCheckedIds(new Set());
          return;
        }
        setOverlay("none");
        return;
      }
      if (typing) return;
      if (overlay === "compose" || overlay === "settings" || overlay === "staff" || overlay === "sender") {
        return;
      }
      if (e.key === "z" && canUndo) {
        e.preventDefault();
        onUndo();
        return;
      }
      if (e.key === "j") move(1);
      if (e.key === "k") move(-1);
      if (e.key === "x" && selected) toggleCheck(selected.id);
      if (e.key === "Enter" && selected) setOverlay("reader");
      if (e.key === "c" || e.key === "n") openCompose();
      if (e.key === "r" && selected) openCompose(selected);
      if (e.key === "e") bulkArchive();
      if (e.key === "u") {
        const targets = actionTargets();
        if (targets.length) {
          void applyFlags(targets.map((message) => ({ message, patch: { seen: false } })));
          setCheckedIds(new Set());
        }
      }
      if (e.key === "s") bulkFlag();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, openCompose, overlay, selected, checkedIds, canUndo, hiddenIds, messages]);

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
    if (!toast || canUndo) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast, canUndo]);

  useEffect(() => {
    return () => {
      window.clearTimeout(archiveTimer.current);
      window.clearTimeout(sendTimer.current);
      const batch = archiveQueue.current;
      archiveQueue.current = [];
      const draft = pendingSend.current;
      pendingSend.current = null;
      void (async () => {
        for (const message of batch) {
          try {
            await archiveMessage(message.accountId, message.id);
          } catch {
            /* leaving */
          }
        }
        if (draft) {
          try {
            await sendMail(draft);
          } catch {
            /* leaving */
          }
        }
      })();
    };
  }, []);

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
              : feed === "action"
                ? "Nothing needs you right now."
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
        feed={feed}
        messages={visible}
        selectedId={selected?.id ?? null}
        checkedIds={checkedIds}
        onSelect={setSelectedId}
        onToggleCheck={toggleCheck}
        onOpen={(id) => {
          setSelectedId(id);
          setOverlay("reader");
        }}
        onArchive={(message) => onArchive(message)}
        onReply={(message) => openCompose(message)}
        onReading={(message) => void onReading(message)}
        onSender={openSender}
        onBulkArchive={bulkArchive}
        onBulkFlag={bulkFlag}
        onClearChecked={() => setCheckedIds(new Set())}
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
          mailbox={messages}
          onClose={() => setOverlay("none")}
          onReply={() => openCompose(selected)}
          onUnread={() => void onSetFlag(selected, { seen: false })}
          onFlag={() => void onSetFlag(selected, { flagged: !selected.flagged })}
          onArchive={() => void onArchive(selected)}
          onMailTo={openMailTo}
          onSender={() => openSender(selected)}
          onOpen={(id) => setSelectedId(id)}
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

      {overlay === "sender" && senderEmail ? (
        <SenderPage
          email={senderEmail}
          messages={messages.filter(
            (m) => m.fromEmail.toLowerCase() === senderEmail.toLowerCase(),
          )}
          onClose={() => setOverlay("none")}
          onOpen={(id) => {
            setSelectedId(id);
            setOverlay("reader");
          }}
          onAlwaysReading={() => {
            void lockSenderReading(senderEmail)
              .then((next) => {
                setMailbox(next);
                setToast("This sender stays in Reading");
              })
              .catch((err) => setToast(err instanceof Error ? err.message : String(err)));
          }}
          onGuessAgain={() => {
            void resetSender(senderEmail)
              .then((next) => {
                setMailbox(next);
                setToast("Guessing this sender again");
              })
              .catch((err) => setToast(err instanceof Error ? err.message : String(err)));
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast">
          <span>{toast}</span>
          {canUndo ? (
            <button type="button" className="toast-undo" onClick={onUndo}>
              Undo <kbd>z</kbd>
            </button>
          ) : null}
        </div>
      ) : null}
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
