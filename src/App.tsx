import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { addAccount, addAccountOAuth, archiveMessage, checkUpdates as loadCheckUpdates, deleteClipping, hydrateMailbox, isTauri, listClippings, loadComposeAttachments, loadMailbox, lockSenderReading, mailAlerts as loadMailAlerts, moveToAction, moveToReading, removeAccount, resetSender, saveClipping, saveMailDraft, saveStoryOverrides, searchMail, sendMail, setCheckUpdates, setFlag, setMailAlerts, staffBrief as loadStaffBrief, staffStatus as loadStaffStatus, storyOverrides as loadStoryOverrides, summarizeAccount as writeStaffBrief, syncAccount } from "./api";
import { readableText } from "./lib/emailHtml";
import { toEditorHtml } from "./components/LetterEditor";
import { Compose } from "./components/Compose";
import { Desk } from "./components/Desk";
import { Feed } from "./components/Feed";
import { Rail } from "./components/Rail";
import { Reader } from "./components/Reader";
import { Settings } from "./components/Settings";
import { SenderPage } from "./components/SenderPage";
import { Clippings } from "./components/Clippings";
import { Palette, type PaletteCommand } from "./components/Palette";
import { StaffModal } from "./components/StaffModal";
import type { AccountDraft, Clipping, DraftAttachment, FeedId, FlagChange, Mailbox, Message, ReaderMode, SendDraft, StaffBrief, StaffStatus, StoryOverride, SyncStatus } from "./types";
import type { MailTo } from "./lib/links";
import { loadRemoteImagesPref, saveRemoteImagesPref } from "./lib/prefs";
import { loadPaper, PAPER_STOCKS, savePaper, type PaperStock } from "./lib/paper";
import { newestFirst } from "./lib/magazine";
import { fromMessage, forwardSubject, hasReplyAll, ownAddresses, replyAllParts, replySubject, replyTo, withQuote, type ComposeQuote } from "./lib/quote";
import {
  bumpReceipt,
  formatReceipt,
  loadReceipt,
  loadReceiptShownToday,
  saveReceiptShownToday,
  type Receipt,
} from "./lib/receipt";
import { loadWaitingDismissed, saveWaitingDismissed, waitingItems } from "./lib/waiting";
import { groupStories, patchOverride, railStories, type StoryDesk } from "./lib/stories";
import { UNDO_MS, archiveLabel, flagLabel } from "./lib/undo";
import { checkForUpdate, installUpdate } from "./lib/updates";
import type { Update } from "@tauri-apps/plugin-updater";
import "./styles.css";

type Overlay = "none" | "reader" | "compose" | "settings" | "staff" | "sender" | "palette" | "clippings";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const [deskOpen, setDeskOpen] = useState(false);
  const [paper, setPaper] = useState<PaperStock>(loadPaper);
  const [remoteImages, setRemoteImages] = useState(loadRemoteImagesPref);
  const [mailAlerts, setMailAlertsOn] = useState(true);
  const [checkUpdates, setCheckUpdatesOn] = useState(true);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [staff, setStaff] = useState<StaffStatus>({
    hired: false,
    provider: "openai",
    model: "",
    endpoint: "",
    summarize: false,
    summarizeAccount: false,
    summarizeNew: false,
    drafts: false,
    triage: false,
    triageNew: false,
    schedule: false,
  });
  const [brief, setBrief] = useState<StaffBrief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFromId, setComposeFromId] = useState("");
  const [composeFiles, setComposeFiles] = useState<DraftAttachment[]>([]);
  const [composeQuote, setComposeQuote] = useState<ComposeQuote | null>(null);
  const [composeInReplyTo, setComposeInReplyTo] = useState<string | null>(null);
  const [composeReplaceId, setComposeReplaceId] = useState<string | null>(null);
  const [composeHeading, setComposeHeading] = useState("New letter");
  const [sendBusy, setSendBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [paletteHits, setPaletteHits] = useState<Message[]>([]);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSearching, setPaletteSearching] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [receipt, setReceipt] = useState<Receipt>(loadReceipt);
  const [waitingDismissed, setWaitingDismissed] = useState(loadWaitingDismissed);
  const [storyOverrides, setStoryOverrides] = useState<Record<string, StoryOverride>>({});
  const [storyFilter, setStoryFilter] = useState<string | null>(null);
  const [clippings, setClippings] = useState<Clipping[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [settingsNonce, setSettingsNonce] = useState(0);
  const [syncByAccount, setSyncByAccount] = useState<Record<string, SyncStatus>>({});
  const seenOnOpen = useRef<string | null>(null);
  const pendingUpdate = useRef<Update | null>(null);
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const archiveQueue = useRef<Message[]>([]);
  const archiveTimer = useRef(0);
  const sendTimer = useRef(0);
  const pendingSend = useRef<SendDraft | null>(null);
  const pendingQuote = useRef<ComposeQuote | null>(null);
  const pendingHeading = useRef("New letter");
  const saveDraftRef = useRef<() => void>(() => {});
  const flagUndo = useRef<FlagChange[] | null>(null);
  const undoKind = useRef<"archive" | "flag" | "send" | null>(null);
  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;

  function note(field: "archived" | "flagged" | "unread" | "sent" | "reading", delta = 1) {
    setReceipt(bumpReceipt(field, delta));
  }

  const refresh = useCallback((accountFilter: string | null) => {
    return loadMailbox(accountFilter).then(setMailbox);
  }, []);

  useEffect(() => {
    refresh(null).catch(() => {
      setToast("Could not load mailbox");
    });
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = paper;
    savePaper(paper);
  }, [paper]);

  useEffect(() => {
    if (!isTauri()) return;
    void loadMailAlerts().then(setMailAlertsOn).catch(() => {});
    void loadCheckUpdates().then(setCheckUpdatesOn).catch(() => {});
    void loadStaffStatus().then(setStaff).catch(() => {});
    void loadStoryOverrides().then(setStoryOverrides).catch(() => {});
    void listClippings().then(setClippings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTauri() || !checkUpdates) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkForUpdate()
        .then((update) => {
          if (cancelled || !update) return;
          pendingUpdate.current = update;
          setUpdateVersion(update.version);
        })
        .catch(() => {});
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkUpdates]);

  useEffect(() => {
    if (!isTauri() || !staff.summarizeAccount) {
      setBrief(null);
      return;
    }
    let cancelled = false;
    void loadStaffBrief(accountId)
      .then((next) => {
        if (!cancelled) setBrief(next);
      })
      .catch(() => {
        if (!cancelled) setBrief(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, staff.summarizeAccount]);

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
  const ownMail = useMemo(() => ownAddresses(accounts), [accounts]);
  const receiptLine = formatReceipt(receipt);
  const liveBrief = useMemo(() => {
    if (!brief) return null;
    const live = new Set(
      messages
        .filter((message) => {
          if (accountId && message.accountId !== accountId) return false;
          if (hiddenIds.has(message.id)) return false;
          return message.unread && message.feed === "action" && message.folder === "inbox";
        })
        .map((message) => message.id),
    );
    const items = brief.items.filter((item) => live.has(item.id));
    return items.length === brief.items.length ? brief : { ...brief, items };
  }, [brief, messages, accountId, hiddenIds]);
  const awaiting = useMemo(() => {
    const own = new Set(accounts.map((account) => account.address.toLowerCase()));
    const scoped = accountId
      ? messages.filter((message) => message.accountId === accountId)
      : messages;
    return waitingItems(scoped, waitingDismissed, own);
  }, [messages, accounts, accountId, waitingDismissed]);

  const inbox = useMemo(
    () =>
      messages.filter((m) => {
        if (accountId && m.accountId !== accountId) return false;
        if (hiddenIds.has(m.id)) return false;
        return m.folder === "inbox";
      }),
    [messages, accountId, hiddenIds],
  );

  const stories = useMemo(
    () => groupStories(inbox, storyOverrides),
    [inbox, storyOverrides],
  );

  const nextAction = useMemo(() => {
    const unread = inbox.find((m) => m.feed === "action" && m.unread);
    if (unread) return unread;
    return awaiting[0]?.message ?? null;
  }, [inbox, awaiting]);

  const visible = useMemo(() => {
    if (storyFilter) {
      const story = stories.find((item) => item.id === storyFilter);
      return newestFirst(story?.messages ?? []);
    }
    if (feed === "awaiting") {
      return newestFirst(
        awaiting
          .map((item) => item.message)
          .filter((message) => !hiddenIds.has(message.id)),
      );
    }
    if (feed === "radar") {
      return newestFirst(
        inbox.filter((m) => m.invite && m.folder !== "junk"),
      );
    }
    return newestFirst(
      messages.filter((m) => {
        if (accountId && m.accountId !== accountId) return false;
        if (hiddenIds.has(m.id)) return false;
        if (feed === "sent" || feed === "drafts" || feed === "junk" || feed === "archive") {
          return m.folder === feed;
        }
        if (feed.startsWith("custom:")) return m.folder === feed;
        if (m.folder !== "inbox") return false;
        if (m.feed !== feed) return false;
        return true;
      }),
    );
  }, [messages, accountId, feed, hiddenIds, awaiting, storyFilter, stories, inbox]);

  const digest = useMemo(() => {
    if (feed !== "action" || storyFilter) return [];
    return newestFirst(
      messages.filter((m) => {
        if (accountId && m.accountId !== accountId) return false;
        if (hiddenIds.has(m.id)) return false;
        return m.folder === "inbox" && m.feed === "reading";
      }),
    ).slice(0, 6);
  }, [messages, accountId, feed, hiddenIds, storyFilter]);

  const persistStories = useCallback((next: Record<string, StoryOverride>) => {
    setStoryOverrides(next);
    void saveStoryOverrides(next).catch(() => {
      setToast("Could not save that story.");
    });
  }, []);

  const storyDesk = useMemo((): StoryDesk => {
    return {
      overrides: storyOverrides,
      filter: storyFilter,
      onFilter: (id) => {
        setStoryFilter(id);
        if (id && feed !== "action" && feed !== "reading") setFeed("action");
      },
      onPin: (id, on) => persistStories(patchOverride(storyOverrides, id, { pinned: on })),
      onRename: (id, title) => persistStories(patchOverride(storyOverrides, id, { title })),
      onMerge: (id, into) => {
        persistStories(patchOverride(storyOverrides, id, { mergeInto: into }));
        setStoryFilter((current) => (current === id ? into : current));
      },
      onReject: (id) => {
        persistStories(
          patchOverride(storyOverrides, id, { rejected: true, pinned: false, mergeInto: null }),
        );
        setStoryFilter((current) => (current === id ? null : current));
      },
    };
  }, [storyOverrides, storyFilter, feed, persistStories]);

  useEffect(() => {
    if (!storyFilter) return;
    if (!stories.some((item) => item.id === storyFilter && item.messages.length > 0)) {
      setStoryFilter(null);
    }
  }, [storyFilter, stories]);

  useEffect(() => {
    if (overlay !== "palette") return;
    const q = paletteQuery.trim();
    if (q.length < 2 || q.startsWith(">")) {
      setPaletteHits([]);
      setPaletteSearching(false);
      return;
    }
    let cancelled = false;
    setPaletteSearching(true);
    const timer = window.setTimeout(() => {
      void searchMail(q, accountId)
        .then((ids) => {
          if (cancelled) return;
          const byId = new Map(messages.map((m) => [m.id, m]));
          setPaletteHits(
            ids.flatMap((id) => {
              const hit = byId.get(id);
              return hit ? [hit] : [];
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setPaletteHits([]);
        })
        .finally(() => {
          if (!cancelled) setPaletteSearching(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [overlay, paletteQuery, accountId, messages]);

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
    setComposeCc(mail.cc ?? "");
    setComposeBcc(mail.bcc ?? "");
    setComposeSubject(mail.subject);
    setComposeBody(mail.body ? toEditorHtml(mail.body) : "");
    setComposeFromId(accountId ?? accounts[0]?.id ?? "");
    setComposeFiles([]);
    setComposeQuote(null);
    setComposeInReplyTo(null);
    setComposeReplaceId(null);
    setComposeHeading("New letter");
    setSendError(null);
    setOverlay("compose");
  }, [accountId, accounts]);

  const openCompose = useCallback((draft?: Partial<Message>, letter?: string) => {
    setComposeTo(draft ? replyTo(draft, ownMail) : "");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject(draft ? replySubject(draft.subject ?? "") : "");
    setComposeBody(letter ? toEditorHtml(letter) : "");
    setComposeQuote(draft ? fromMessage(draft) : null);
    setComposeFromId(draft?.accountId ?? accountId ?? accounts[0]?.id ?? "");
    setComposeFiles([]);
    setComposeInReplyTo(draft?.rfcId ?? null);
    setComposeReplaceId(null);
    setComposeHeading(draft ? "Reply" : "New letter");
    setSendError(null);
    setOverlay("compose");
  }, [accountId, accounts, ownMail]);

  const openReplyAll = useCallback((message: Message) => {
    const parts = replyAllParts(message, ownMail);
    setComposeTo(parts.to);
    setComposeCc(parts.cc);
    setComposeBcc("");
    setComposeSubject(replySubject(message.subject ?? ""));
    setComposeBody("");
    setComposeQuote(fromMessage(message));
    setComposeFromId(message.accountId ?? accountId ?? accounts[0]?.id ?? "");
    setComposeFiles([]);
    setComposeInReplyTo(message.rfcId ?? null);
    setComposeReplaceId(null);
    setComposeHeading("Reply all");
    setSendError(null);
    setOverlay("compose");
  }, [accountId, accounts, ownMail]);

  const openForward = useCallback((message: Message) => {
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject(forwardSubject(message.subject ?? ""));
    setComposeBody("");
    setComposeQuote(fromMessage(message));
    setComposeFromId(message.accountId ?? accountId ?? accounts[0]?.id ?? "");
    setComposeFiles([]);
    setComposeInReplyTo(null);
    setComposeReplaceId(null);
    setComposeHeading("Forward");
    setSendError(null);
    setOverlay("compose");
    void loadComposeAttachments(message.id)
      .then(setComposeFiles)
      .catch(() => {
        /* quote-only forward if files cannot be read */
      });
  }, [accountId, accounts]);

  const resumeDraft = useCallback((message: Message) => {
    setComposeTo(message.toEmail ?? "");
    setComposeCc(message.ccEmail ?? "");
    setComposeBcc("");
    setComposeSubject(message.subject === "(no subject)" ? "" : message.subject);
    setComposeBody(toEditorHtml(message.htmlBody || message.body || ""));
    setComposeQuote(null);
    setComposeFromId(message.accountId);
    setComposeFiles([]);
    setComposeInReplyTo(message.inReplyTo ?? null);
    setComposeReplaceId(message.id);
    setComposeHeading("Draft");
    setSendError(null);
    setOverlay("compose");
    void loadComposeAttachments(message.id)
      .then(setComposeFiles)
      .catch(() => {
        /* continue without files */
      });
  }, []);

  async function writeBrief() {
    setBriefBusy(true);
    setBriefError(null);
    setFeed("action");
    try {
      setBrief(await writeStaffBrief(accountId));
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : String(err));
    } finally {
      setBriefBusy(false);
    }
  }

  async function onAddAccount(draft: AccountDraft) {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const next = await addAccount(draft);
      setMailbox(next);
      setAccountId(null);
      setStoryFilter(null);
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
    if (!draft.address.trim().includes("@")) {
      setAccountError("Enter the mailbox address, then Sign in with Google or Microsoft.");
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const next = await addAccountOAuth(draft, provider);
      setMailbox(next);
      setAccountId(null);
      setStoryFilter(null);
      setSettingsNonce((n) => n + 1);
      setToast("Signed in. Fetching mail.");
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
      cc: composeCc,
      bcc: composeBcc,
      subject: composeSubject,
      body: readableText(composeBody),
      html: composeBody,
      attachments: composeFiles,
      inReplyTo: composeInReplyTo,
      replaceId: composeReplaceId,
      confirm: true,
    };
    setSendBusy(false);
    setSendError(null);
    await flushArchive();
    pendingSend.current = draft;
    pendingQuote.current = composeQuote;
    pendingHeading.current = composeHeading;
    undoKind.current = "send";
    flagUndo.current = null;
    setOverlay("none");
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeFiles([]);
    setComposeQuote(null);
    setComposeInReplyTo(null);
    setComposeReplaceId(null);
    setComposeHeading("New letter");
    setCanUndo(true);
    setToast("Sending");
    window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => {
      void commitSend();
    }, UNDO_MS);
  }

  function restoreCompose(draft: SendDraft, quote: ComposeQuote | null = pendingQuote.current) {
    setComposeTo(draft.to);
    setComposeCc(draft.cc ?? "");
    setComposeBcc(draft.bcc ?? "");
    setComposeSubject(draft.subject);
    setComposeBody(draft.html || draft.body);
    setComposeFromId(draft.accountId);
    setComposeFiles(draft.attachments ?? []);
    setComposeQuote(quote);
    setComposeInReplyTo(draft.inReplyTo ?? null);
    setComposeReplaceId(draft.replaceId ?? null);
    setComposeHeading(pendingHeading.current);
    pendingQuote.current = null;
    setSendError(null);
    setOverlay("compose");
  }

  async function onSaveDraft() {
    const from = composeFromId || accountId || accounts[0]?.id;
    if (!from) {
      setSendError("Add a mailbox in Settings before saving a draft.");
      return;
    }
    const draft: SendDraft = {
      accountId: from,
      to: composeTo,
      cc: composeCc,
      bcc: composeBcc,
      subject: composeSubject,
      body: readableText(composeBody),
      html: composeBody,
      attachments: composeFiles,
      inReplyTo: composeInReplyTo,
      replaceId: composeReplaceId,
      confirm: false,
    };
    const sealed = { ...draft, ...withQuote(draft.html ?? "", draft.body, composeQuote) };
    setDraftBusy(true);
    setSendError(null);
    try {
      const next = await saveMailDraft(sealed);
      setMailbox(next);
      setOverlay("none");
      setComposeFiles([]);
      setComposeQuote(null);
      setComposeReplaceId(null);
      setFeed("drafts");
      setAccountId(from);
      setToast("Saved to Drafts");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftBusy(false);
    }
  }
  saveDraftRef.current = () => {
    void onSaveDraft();
  };

  async function commitSend() {
    window.clearTimeout(sendTimer.current);
    const draft = pendingSend.current;
    pendingSend.current = null;
    const quote = pendingQuote.current;
    pendingQuote.current = null;
    if (undoKind.current === "send") {
      undoKind.current = null;
      setCanUndo(false);
    }
    if (!draft) return;
    const sealed = { ...draft, ...withQuote(draft.html ?? "", draft.body, quote) };
    setSendBusy(true);
    try {
      const next = await sendMail(sealed);
      setMailbox(next);
      setFeed("sent");
      setAccountId(draft.accountId);
      setToast("Sent");
      note("sent");
    } catch (err) {
      restoreCompose(draft, quote);
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
      note("archived", batch.length);
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
      (message) =>
        message.folder !== "archive" &&
        !archiveQueue.current.some((queued) => queued.id === message.id),
    );
    if (extra.length === 0) return;
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
      if (flagged === true) note("flagged", items.length);
      if (seen === false) note("unread", items.length);
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
          const flaggedOn = reverse.some((change) => change.flagged === false);
          if (flaggedOn) note("flagged", -reverse.length);
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
      note("reading");
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function onAction(message: Message) {
    try {
      const next = await moveToAction(message.id);
      setMailbox(next);
      setToast("Moved to Action");
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  function openSender(message: Message) {
    setSenderEmail(message.fromEmail);
    setOverlay("sender");
  }

  function dismissWaiting(id: string) {
    setWaitingDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveWaitingDismissed(next);
      return next;
    });
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
        if (
          overlay === "compose" ||
          overlay === "settings" ||
          overlay === "staff" ||
          overlay === "sender" ||
          overlay === "clippings"
        ) {
          return;
        }
        e.preventDefault();
        if (overlay === "palette") setOverlay("none");
        else {
          setPaletteQuery("");
          setPaletteHits([]);
          setOverlay("palette");
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openCompose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (overlay === "compose") {
          e.preventDefault();
          void saveDraftRef.current();
        }
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
      if (overlay === "compose" || overlay === "settings" || overlay === "staff" || overlay === "sender" || overlay === "palette" || overlay === "clippings") {
        return;
      }
      if (e.key === "z" && canUndo) {
        e.preventDefault();
        onUndo();
        return;
      }
      if (e.key === "/" ) {
        e.preventDefault();
        setPaletteQuery("");
        setPaletteHits([]);
        setOverlay("palette");
        return;
      }
      if (e.key === "j") move(1);
      if (e.key === "k") move(-1);
      if (e.key === "x" && selected) toggleCheck(selected.id);
      if (e.key === "Enter" && selected) {
        if (selected.folder === "drafts") resumeDraft(selected);
        else setOverlay("reader");
      }
      if (e.key === "c" || e.key === "n") openCompose();
      if (e.key === "r" && selected) {
        if (selected.folder === "drafts") resumeDraft(selected);
        else openCompose(selected);
      }
      if (e.key === "a" && selected && selected.folder !== "drafts") openReplyAll(selected);
      if (e.key === "f" && selected && selected.folder !== "drafts") openForward(selected);
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
  }, [move, openCompose, openForward, openReplyAll, overlay, resumeDraft, selected, checkedIds, canUndo, hiddenIds, messages]);

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
    const ms = toast.startsWith("You ") && toast.endsWith(" today.") ? 4500 : 2200;
    const id = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(id);
  }, [toast, canUndo]);

  useEffect(() => {
    let timer = 0;
    function arm() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (canUndoRef.current) {
          arm();
          return;
        }
        const line = formatReceipt();
        if (!line || loadReceiptShownToday()) return;
        saveReceiptShownToday();
        setToast(line);
      }, 120_000);
    }
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(archiveTimer.current);
      window.clearTimeout(sendTimer.current);
      const batch = archiveQueue.current;
      archiveQueue.current = [];
      const draft = pendingSend.current;
      pendingSend.current = null;
      const quote = pendingQuote.current;
      pendingQuote.current = null;
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
            await sendMail({ ...draft, ...withQuote(draft.html ?? "", draft.body, quote) });
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
          ? "No drafts yet. Save from Compose, or Sync if they live on the server."
          : feed === "junk"
            ? "Junk is empty."
            : feed === "archive"
              ? "No back issues yet. Archive a letter and it lands on this shelf."
            : feed.startsWith("custom:")
              ? "Nothing in this folder."
              : feed === "awaiting"
                ? "Nothing you're waiting on. Flag a letter to chase a reply, or a sent letter with no answer after four days shows up here."
                : feed === "radar"
                  ? "No meeting invites in this mailbox. Radar only lists calendar parts that already arrived as mail."
                : feed === "uncertain"
                  ? "Nothing uncertain. Weak matches land here instead of guessing Action."
                : feed === "action"
                  ? accountId === null && accounts.length > 1
                    ? "Nothing needs you in any mailbox."
                    : "Nothing needs you right now."
                  : "Nothing in this feed.";

  const paletteCommands: PaletteCommand[] = [
    {
      id: "awaiting",
      label: awaiting.length > 0 ? `Awaiting reply (${awaiting.length})` : "Awaiting reply",
      run: () => {
        setFeed("awaiting");
        setOverlay("none");
      },
    },
    {
      id: "clippings",
      label: clippings.length > 0 ? `Clippings (${clippings.length})` : "Clippings",
      run: () => {
        setOverlay("clippings");
      },
    },
    {
      id: "radar",
      label: "Radar",
      run: () => {
        setFeed("radar");
        setOverlay("none");
      },
    },
    {
      id: "uncertain",
      label: "Uncertain",
      run: () => {
        setFeed("uncertain");
        setOverlay("none");
      },
    },
    {
      id: "brief",
      label: "Morning Brief",
      run: () => {
        setFeed("action");
        setOverlay("none");
        if (staff.hired && staff.summarizeAccount) void writeBrief();
      },
    },
    ...(!staff.hired
      ? []
      : railStories(stories).map((story) => ({
          id: `story-${story.id}`,
          label: `Story: ${story.title}`,
          hint: String(story.messages.length),
          run: () => {
            setStoryFilter(story.id);
            setFeed("action");
            setOverlay("none");
          },
        }))),
    {
      id: "desk",
      label: "Open staff desk",
      run: () => {
        setDeskOpen(true);
        setOverlay("none");
      },
    },
    {
      id: "compose",
      label: "Compose",
      hint: "c",
      run: () => {
        setOverlay("none");
        openCompose();
      },
    },
    ...(selected
      ? [
          {
            id: "reply",
            label: "Reply",
            hint: "r",
            run: () => {
              setOverlay("none");
              openCompose(selected);
            },
          },
          ...(hasReplyAll(selected, ownMail)
            ? [
                {
                  id: "reply-all",
                  label: "Reply all",
                  hint: "a",
                  run: () => {
                    setOverlay("none");
                    openReplyAll(selected);
                  },
                },
              ]
            : []),
          {
            id: "forward",
            label: "Forward this letter",
            hint: "f",
            run: () => {
              setOverlay("none");
              openForward(selected);
            },
          },
        ]
      : []),
    {
      id: "action",
      label: "Go to Action",
      run: () => {
        setFeed("action");
        setOverlay("none");
      },
    },
    {
      id: "reading",
      label: "Go to Reading",
      run: () => {
        setFeed("reading");
        setOverlay("none");
      },
    },
    {
      id: "archive",
      label: "Back issues",
      run: () => {
        setFeed("archive");
        setOverlay("none");
      },
    },
    {
      id: "sent",
      label: "Go to Sent",
      run: () => {
        setFeed("sent");
        setOverlay("none");
      },
    },
    {
      id: "drafts",
      label: "Go to Drafts",
      run: () => {
        setFeed("drafts");
        setOverlay("none");
      },
    },
    {
      id: "junk",
      label: "Go to Junk",
      run: () => {
        setFeed("junk");
        setOverlay("none");
      },
    },
    {
      id: "magazine",
      label: "Magazine view",
      run: () => {
        setMode("magazine");
        setOverlay("none");
      },
    },
    {
      id: "raw",
      label: "Raw view",
      run: () => {
        setMode("raw");
        setOverlay("none");
      },
    },
    ...PAPER_STOCKS.map((stock) => ({
      id: `paper-${stock.id}`,
      label: `${stock.label} paper`,
      run: () => {
        setPaper(stock.id);
        setOverlay("none");
      },
    })),
    {
      id: "archive-visible",
      label: "Archive this feed",
      hint: `${visible.length}`,
      run: () => {
        setOverlay("none");
        queueArchive(visible);
      },
    },
    {
      id: "archive-reading",
      label: "Archive all in Reading",
      run: () => {
        setOverlay("none");
        queueArchive(
          messages.filter(
            (m) =>
              m.folder === "inbox" &&
              m.feed === "reading" &&
              !hiddenIds.has(m.id) &&
              (!accountId || m.accountId === accountId),
          ),
        );
      },
    },
    {
      id: "settings",
      label: "Settings",
      run: () => {
        setAccountError(null);
        setOverlay("settings");
      },
    },
    {
      id: "updates",
      label: "Check for updates",
      run: () => {
        setOverlay("none");
        void checkForUpdate()
          .then((update) => {
            if (!update) {
              setToast("Bateleur is up to date");
              return;
            }
            pendingUpdate.current = update;
            setUpdateVersion(update.version);
          })
          .catch(() => {
            setToast("Could not reach GitHub for updates");
          });
      },
    },
    {
      id: "staff",
      label: staff.hired ? "Staff" : "Hire staff",
      run: () => {
        setDeskOpen(true);
        setOverlay("staff");
      },
    },
    {
      id: "all-mail",
      label: "All mailboxes",
      run: () => {
        setAccountId(null);
        setStoryFilter(null);
        setOverlay("none");
      },
    },
    ...accounts.map((account) => ({
      id: `acct-${account.id}`,
      label: `Jump to ${account.label}`,
      hint: account.address,
      run: () => {
        setAccountId(account.id);
        setStoryFilter(null);
        setOverlay("none");
      },
    })),
    ...(mailbox?.folders ?? [])
      .filter((folder) => folder.canonical === "custom")
      .map((folder) => ({
        id: `folder-${folder.imapName}`,
        label: `Go to ${folder.label}`,
        run: () => {
          setFeed(`custom:${folder.imapName}`);
          setOverlay("none");
        },
      })),
  ];

  return (
    <>
    <div className={deskOpen ? "shell desk-open" : "shell"}>
      <Rail
        accounts={accounts}
        accountId={accountId}
        onAccount={(id) => {
          setAccountId(id);
          setStoryFilter(null);
        }}
        feed={feed}
        onFeed={setFeed}
        waiting={waitingFor(messages, accountId)}
        awaiting={awaiting.length}
        uncertain={inbox.filter((m) => m.feed === "uncertain").length}
        radar={inbox.filter((m) => m.invite).length}
        clippings={clippings.length}
        clippingsOpen={overlay === "clippings"}
        onClippings={() => setOverlay(overlay === "clippings" ? "none" : "clippings")}
        sync={syncCaption(syncByAccount, accountId)}
        folders={mailbox?.folders ?? []}
        mode={mode}
        onMode={setMode}
        onCompose={() => openCompose()}
        onSettings={() => {
          setAccountError(null);
          setOverlay("settings");
        }}
        paper={paper}
        onPaper={setPaper}
        stories={
          staff.hired
            ? railStories(stories).map((story) => ({
                id: story.id,
                title: story.title,
                count: story.messages.length,
              }))
            : []
        }
        storyId={storyFilter}
        onStory={(id) => {
          setStoryFilter(id);
          if (id && feed !== "action" && feed !== "reading") setFeed("action");
        }}
      />
      <Feed
        onPalette={() => {
          setPaletteQuery("");
          setPaletteHits([]);
          setOverlay("palette");
        }}
        mode={mode}
        feed={feed}
        messages={visible}
        digest={digest}
        selectedId={selected?.id ?? null}
        checkedIds={checkedIds}
        onSelect={setSelectedId}
        onToggleCheck={toggleCheck}
        onOpen={(id) => {
          const message = messages.find((item) => item.id === id);
          if (message?.folder === "drafts") {
            resumeDraft(message);
            return;
          }
          setSelectedId(id);
          setOverlay("reader");
        }}
        onArchive={(message) => onArchive(message)}
        onReply={(message) => openCompose(message)}
        onReading={(message) => void onReading(message)}
        onAction={(message) => void onAction(message)}
        onSender={openSender}
        onBulkArchive={bulkArchive}
        onBulkFlag={bulkFlag}
        onClearChecked={() => setCheckedIds(new Set())}
        emptyLabel={emptyLabel}
        combinedFrom={
          accountId === null && accounts.length > 1
            ? accounts.map((account) => account.label).join(" · ")
            : null
        }
        mailboxOf={
          accountId === null && accounts.length > 1
            ? (id) => accounts.find((account) => account.id === id)?.label
            : undefined
        }
        receiptLine={feed === "action" ? receiptLine : null}
        awaiting={feed === "awaiting" ? awaiting : []}
        onDismissAwaiting={dismissWaiting}
        brief={liveBrief}
        briefBusy={briefBusy}
        briefError={briefError}
        showBrief={staff.hired && staff.summarizeAccount && !storyFilter}
        onWriteBrief={() => void writeBrief()}
        stories={staff.hired ? storyDesk : undefined}
      />
      <Desk
        open={deskOpen}
        onToggle={() => setDeskOpen((v) => !v)}
        onHire={() => {
          setDeskOpen(true);
          setOverlay("staff");
        }}
        onBrief={() => void writeBrief()}
        briefBusy={briefBusy}
        receipt={receiptLine}
        hired={staff.hired}
        summarize={staff.summarize}
        summarizeAccount={staff.summarizeAccount}
        drafts={staff.drafts}
        triage={staff.triage}
        schedule={staff.schedule}
        next={staff.hired ? nextAction : null}
        onOpenNext={() => {
          if (!nextAction) return;
          setSelectedId(nextAction.id);
          setOverlay("reader");
        }}
        onReplyNext={() => {
          if (nextAction) openCompose(nextAction);
        }}
        onDraftNext={(body) => {
          if (nextAction) openCompose(nextAction, body);
        }}
      />
    </div>

      {overlay === "reader" && selected ? (
        <Reader
          message={selected}
          account={accounts.find((a) => a.id === selected.accountId)}
          mailbox={messages}
          onClose={() => setOverlay("none")}
          onReply={() => openCompose(selected)}
          onReplyAll={
            hasReplyAll(selected, ownMail) ? () => openReplyAll(selected) : undefined
          }
          onForward={() => openForward(selected)}
          onUnread={() => void onSetFlag(selected, { seen: false })}
          onFlag={() => void onSetFlag(selected, { flagged: !selected.flagged })}
          onArchive={() => void onArchive(selected)}
          onAction={
            selected.feed === "uncertain" ? () => void onAction(selected) : undefined
          }
          onReading={
            selected.feed === "uncertain" ? () => void onReading(selected) : undefined
          }
          onMailTo={openMailTo}
          onSender={() => openSender(selected)}
          onOpen={(id) => setSelectedId(id)}
          remoteImages={remoteImages}
          onRemoteImages={(on) => {
            setRemoteImages(on);
            saveRemoteImagesPref(on);
          }}
          staff={staff}
          onHire={() => setOverlay("staff")}
          onDraft={(body) => openCompose(selected, body)}
          onTriaged={() => {
            void refresh(accountId);
          }}
          storyOverrides={storyOverrides}
          clippings={clippings}
          onKeep={(quote) => {
            void saveClipping(selected.id, quote)
              .then((next) => {
                setClippings(next);
                setToast("Kept");
              })
              .catch((err) => setToast(err instanceof Error ? err.message : String(err)));
          }}
          onDropClip={(id) => {
            void deleteClipping(id)
              .then(setClippings)
              .catch((err) => setToast(err instanceof Error ? err.message : String(err)));
          }}
        />
      ) : null}

      {overlay === "compose" ? (
        <Compose
          heading={composeHeading}
          accounts={accounts}
          fromId={composeFromId || accounts[0]?.id || ""}
          onFrom={setComposeFromId}
          to={composeTo}
          cc={composeCc}
          bcc={composeBcc}
          subject={composeSubject}
          body={composeBody}
          onTo={setComposeTo}
          onCc={setComposeCc}
          onBcc={setComposeBcc}
          onSubject={setComposeSubject}
          onBody={setComposeBody}
          files={composeFiles}
          onFiles={setComposeFiles}
          quote={composeQuote}
          busy={sendBusy}
          saving={draftBusy}
          error={sendError}
          onClose={() => {
            setOverlay("none");
            setComposeFiles([]);
          }}
          onSave={() => void onSaveDraft()}
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
          checkUpdates={checkUpdates}
          onCheckUpdates={(on) => {
            setCheckUpdatesOn(on);
            void setCheckUpdates(on).catch(() => {});
          }}
        />
      ) : null}

      {overlay === "staff" ? (
        <StaffModal
          onClose={() => setOverlay("none")}
          onChange={setStaff}
        />
      ) : null}

      {overlay === "palette" ? (
        <Palette
          commands={paletteCommands}
          hits={paletteHits}
          searching={paletteSearching}
          onQuery={setPaletteQuery}
          onClose={() => setOverlay("none")}
          onOpen={(id) => {
            setSelectedId(id);
            setOverlay("reader");
          }}
        />
      ) : null}

      {overlay === "clippings" ? (
        <Clippings
          clippings={clippings}
          onClose={() => setOverlay("none")}
          onOpen={(id) => {
            if (!messages.some((message) => message.id === id)) {
              setToast("That letter is no longer in the cache.");
              return;
            }
            setSelectedId(id);
            setOverlay("reader");
          }}
          onRemove={(id) => {
            void deleteClipping(id)
              .then(setClippings)
              .catch((err) => setToast(err instanceof Error ? err.message : String(err)));
          }}
        />
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

      {updateVersion ? (
        <div className="toast">
          <span>
            {updateBusy ? "Installing update…" : `Bateleur ${updateVersion} is ready`}
          </span>
          {updateBusy ? null : (
            <>
              <button
                type="button"
                className="toast-undo"
                onClick={() => {
                  const next = pendingUpdate.current;
                  if (!next) return;
                  setUpdateBusy(true);
                  void installUpdate(next).catch((err) => {
                    setUpdateBusy(false);
                    setToast(err instanceof Error ? err.message : String(err));
                  });
                }}
              >
                Install
              </button>
              <button
                type="button"
                className="toast-undo"
                onClick={() => {
                  pendingUpdate.current = null;
                  setUpdateVersion(null);
                }}
              >
                Later
              </button>
            </>
          )}
        </div>
      ) : toast ? (
        <div className="toast">
          <span>{toast}</span>
          {canUndo ? (
            <button type="button" className="toast-undo" onClick={onUndo}>
              Undo <kbd>z</kbd>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function syncCaption(
  byAccount: Record<string, SyncStatus>,
  accountId: string | null,
): { label: string; hint: string } | null {
  const rows = accountId
    ? [byAccount[accountId]].filter(Boolean)
    : Object.values(byAccount);
  if (rows.some((row) => row.state === "syncing")) {
    return { label: "Syncing", hint: "Fetching from the server." };
  }
  if (rows.some((row) => row.state === "error")) {
    return {
      label: "Sync failed",
      hint: "Could not reach the server. Try Settings → Sync.",
    };
  }
  return null;
}
