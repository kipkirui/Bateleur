# Bateleur

Make Email Great Again. Email as a newsroom. You are the editor, not the intern who has to read every raw wire.

The inbox is not a prettier Gmail list. If you hire staff, a triage agent decides what is front page, a summarizer writes the deck, a reply agent drafts (never sends) routine responses, and you approve. If you do not, it is still a full mail client. The moat is editorial judgment with receipts — not card chrome, and not a mandatory cloud AI subscription.

## Product

**Action is a list. Reading is a magazine.** Do not homogenize. Invoices, 2FA, and “can you look at this by 4?” are compact action rows (sender, one-line ask, status). Newsletters, threads, and long FYI are editorial cards: extracted hero image first (generate only for visual mail), pull-quote, optional synthesized headline if staff is on. “4 min read” is a newsletter metric, not a password reset.

**Staff is optional and off until you turn it on.** The client is complete without any model: add accounts, sync, read magazine or raw, send. Agentic features are provisions, not a paywall and not a default that phones home. Each capability is its own switch (summarize this mail / this account / all new mail; generate a draft; later: triage, scheduling). Nothing runs until the user activates it *and* has a working key.

**Bring your own key.** We do not sell tokens and we do not proxy inference. Hire staff: pick a provider, paste an API key, choose a model. Key lives in the OS keychain next to mail credentials. Mail body is sent to *that* provider only when a turned-on capability needs it — never to our servers.

**Major providers**, behind one thin interface (chat in → text out). First-class: OpenAI, Anthropic, Google Gemini. Escape hatches: OpenRouter (one key, many models) and a compatible endpoint (Azure OpenAI, Groq, local Ollama / LM Studio). Swap provider without rewriting staff. If the key is missing or a call fails, mail still works; staff output is empty with a clear “activate AI” affordance.

**When activated**, staff is visible, not a faceless assistant. Named roles with a paper trail:

- Summarizer — blurb + keywords + optional visual deck
- Drafts — reply/forward drafts only, never send
- Triage (later) — front page vs back page
- Scheduling (later) — meeting requests

Spend the model on what the user asked for. Cheap local classifiers can pre-filter; the LLM is not a firehose on every inbound message unless they opted into that. If staff can be wrong and you can see *why*, people will trust it.

**Reader modes as a contract, not a theme toggle.** Magazine view for browsing. Raw view for work: classic density, keyboard-fast, first-class on day one. Power users bounce if the only density is cards.

**Local-first.** Mail is processed on-device. SQLite is the source of truth. Opening the app is instant even before a fresh sync finishes. Do not upload the inbox to a cloud API just to render it.

**Any mailbox, like Outlook desktop.** This is a universal mail client, not a Gmail wrapper and not an Outlook.com wrapper. You add accounts the way Thunderbird / Outlook / Apple Mail do: email + password (or app password / OAuth where the provider demands it), then IMAP or POP for fetch and SMTP for send. Gmail, Outlook, Yahoo, Fastmail, iCloud, a university box, a company Exchange-with-IMAP, a dusty POP host — same Add Account flow. Multiple accounts in one window; unified inbox or per-account, user’s choice. The newsroom sits on top of *your* mail, whoever hosts it.

## Homepage

Three zones: left = control, center = reading, right = execution. This is a desktop mail client that *looks* like a magazine, not a blog that forgot compose. Design the **staff-off** shell first. The original “Balance 98% / Morning Brief / always-on Co-Pilot” mock is state two only.

Weights: left rail ~220px, center flex, Co-Pilot ~300px **and collapsed when idle or staff off**. Not 15 / 60 / 25 always-on. No emoji in the chrome. One Bateleur mark. Geometric sans for chrome, serif (Merriweather or Lora) only for story headlines and body. Paper: cream `#FDFBF7` and charcoal by day; onyx and amber at night. No glow on the command bar. Zero pop-up windows; cards expand into an article reader (full thread), with a raw/source toggle inside that reader.

### Two states

| | Staff off (default) | Staff on (key + capability switches) |
| --- | --- | --- |
| Left | Accounts, Action / Reading, IMAP folders (Inbox, Sent, Drafts, Junk), Magazine \| Raw, Settings (mail) | Same, plus Stories (pin, rename, merge, “not a story”) |
| Center | Search. Action rows + reading cards from **real subjects** and extracted images | Search, `/command`. Morning Brief. Synthesized headlines allowed. Stories as sections |
| Right | Gone, or a thin Hire staff rail | Co-Pilot **only when there is a next action**. Waiting-on list is manual. No auto-send follow-up |
| Count | `4 waiting` — the Action feed. Never a fake Balance % | Same. Brief may say “3 need your eye”; that is copy, not a health score |

One AI voice when staff is on: the Brief is editor-in-chief. Co-Pilot is the desk waiting for a signature. Stories are sections. They do not all speak in first person.

### Shell

```
[ BATELEUR              ] [ Search mail                    /cmd ] [ DESK (drawer)     ]
[ work@ / personal@     ] [-------------------------------------] [                   ]
[ 4 waiting             ] [ Brief — only if summarize is on     ] [ Next: draft to    ]
[                       ] [                                     ] [ John on Q3.       ]
[ Action                ] [ ACTION                              ] [ Open full letter  ]
[ Reading               ] [ Sarah — aluminum spec, needs reply  ] [ then Send.        ]
[ Sent · Drafts         ] [ David — term sheet, review today    ] [                   ]
[                       ] [-------------------------------------] [ Waiting-on        ]
[ Stories (if staff on) ] [ READING                             ] [ Acme quote        ]
[   Project Titan       ] [ Project Titan: chassis design       ] [ (you flagged)     ]
[   Hiring Q3           ] [ Team finalized the spec. John       ] [                   ]
[                       ] [ objected to cost, approved timeline.] [ hidden if idle    ]
[ Magazine | Raw        ] [                                     ] [                   ]
[ Settings              ] [                                     ] [                   ]
```

**Left — rail.** Account switcher (multi-mailbox). `4 waiting`, not a meter. Feeds: Action, Reading. Real IMAP folders underneath (Sent, Drafts, Junk, custom). Stories only after staff is on; user can pin / rename / merge / reject. Magazine | Raw is a contract control, always visible. Compose lives here or as Cmd+N. Mail setup lives in Settings. AI keys live on Hire staff, not as a rail item.

**Center — feed.** Command bar is **search** until a leading `/` starts a staff command (Cmd+K always focuses it). Action block: compact rows. Reading block: a few featured cards, not two fullscreen articles at 9am. Clicking a story opens an inline article reader (stripped reply-headers and signatures when possible), not a modal. Density beats spectacle.

**Right — desk.** Collapsed by default. When a draft exists: show what it is, open the **full letter** in the reader (To, account, body). Approve means “open draft.” Send is a second, explicit step from that letter. Never Approve & Send from a two-sentence preview. Waiting-on is a flag the user set, not “AI will follow up in 24h.”

### Mail primitives (day one)

Compose (Cmd+N), reply / reply-all / forward, unread / flag, attachments, account switcher, sync status, Magazine | Raw, keyboard j/k (move), e (archive), r (reply), c (compose), Cmd+K (search). If these are missing, it is not an Outlook-shaped client.

### v1 vs later

| Surface | v1 | Later |
| --- | --- | --- |
| Center | Action rows + reading cards; real subjects if no key | Synthesized headlines, Morning Brief |
| Co-Pilot | Collapsed; summarize-this, draft-this | Stage queue; batch-on-sync if opted in |
| Waiting-on | Manual flag | Nudges; still confirm before any send |
| Radar | Meeting invites that already arrived as mail | Calendar protocol (CalDAV / Google) — do not fake it |
| Stories | Off, or on with pin / rename / merge | Auto-file with those overrides |

## Design, language, mobile

**Languages.** TypeScript for the UI (React). Rust for mail, cache, keychain, and staff. The webview never speaks IMAP. Shared crate: `crates/bateleur-core` — desktop and a future mobile shell both depend on it.

**Design.** No Figma required to ship. Source of truth is CSS design tokens in `src/styles.css` (cream paper `#FDFBF7`, charcoal ink, bateleur amber, onyx night). Geometric sans for chrome, serif for story headlines and the letter. If a Figma file appears later, it maps onto these tokens — it does not replace them.

**Mobile later, same product.** Tauri 2 already has a mobile entry point. v1 is desktop. iOS/Android reuse `bateleur-core` plus this React UI (the shell already collapses the rail under 960px). Hard parts on phones: background IMAP sync and push. Those wait; the crate split is the provision so we do not trap logic in `src-tauri` only.

## Stack

Lean desktop app. No Electron, no Gmail API, no Microsoft Graph. Speak IMAP/POP/SMTP so any provider works. Small installer, no restricted-scope app-review gauntlet, no “we only support Google.”

**Shell: Tauri 2**, not Electron. Native OS webview instead of bundled Chromium — installers ~10–20MB instead of ~150MB+, much lower idle memory. UI in React + TypeScript. The magazine layer is the main window.

**Protocol layer: Rust mail crates**, not hand-rolled IMAP/POP/SMTP and not provider REST APIs. IMAP has ugly edge cases (MIME, encodings, threading, partial fetch, IDLE, provider quirks). Use mature crates and spend effort on the newsroom:

| Role | Crate | Notes |
| --- | --- | --- |
| IMAP (primary) | `async-imap` | Folders, flags, search, IDLE. Default for any host that offers it. |
| POP3 | `async-pop` | Accounts / providers that only offer POP, or users who want download-local. No server-side folders; ingest into SQLite. |
| SMTP | `lettre` | Send for every account. Confirm-gated. |
| MIME | `mail-parser` | Parse once after fetch; agents never see raw RFC822. |

Account setup is a first-class feature, not a config file. Flow: enter address → try autoconfig / SRV / well-known IMAP/SMTP hosts → if that fails, manual server, port, TLS, username. Persist N accounts in SQLite; credentials in the OS keychain (Tauri keyring plugin), never plaintext. Auth is protocol-native: password, app password, or XOAUTH2 only when a host requires it — still IMAP, not a vendor REST API.

IMAP is the default sync path. POP is a first-class ingest option. After the message is in SQLite, the pipeline does not care which transport or which provider it came from.

**Local storage:** SQLite for accounts, cached message metadata, per-capability staff settings, and agent outputs (summaries, categories, chosen images, drafts, decisions). UI reads the cache only.

**Agent layer:** a provider-agnostic staff runtime, not a Gmail feature. Input is always *parsed email text from SQLite*. IMAP vs POP vs which mailbox does not touch this layer. Which LLM vendor does not touch it either — only the adapter does.

Sync stays dumb: fetch → parse → cache → render. Staff runs only for capabilities the user has activated, with their key, against their chosen provider. Outputs write back to SQLite so the UI stays instant and the paper trail is local.

**Distribution:** Tauri signed installers per platform (`.dmg`, `.msi`, AppImage/`.deb`) plus built-in auto-updater. Same Rust core can later ship as iOS/Android via Tauri 2 mobile (`tauri ios init` / `tauri android init`) — not a rewrite.

## How the pieces stack

```
[ Tauri window — magazine | raw | accounts | AI settings ]
              │
              ▼
     [ SQLite: accounts + messages + staff output ]
              ▲                           │
              │                           ▼
[ Per-account sync:              [ Staff, if activated + key ]
   async-imap | async-pop ]         summarize | draft | later…
              │                           │
              ▼                           ▼
       [ mail-parser ]     [ LLM adapter — BYOK ]
                              OpenAI | Anthropic | Gemini
                              OpenRouter | compatible endpoint

[ lettre, via that account’s SMTP ]  ← send only after confirm
```

`bateleur-core` is the crate in the middle. Desktop (`src-tauri`) and a future mobile binary both call it.

## Build order

1. **Staff-off homepage first.** Shipped. No fixture mailbox. The three-zone shell (compose, accounts, Action / Reading, Magazine | Raw, Co-Pilot collapsed) reads live IMAP mail from SQLite.
2. **Add Account + one real IMAP round-trip.** Autoconfig, then manual settings. Password in the OS keychain (not a mock store). Fetch → parse → cache → render works on any IMAP host, including HTML newsletters opened as designed and readable subjects/previews (entities and tags stripped in summaries). Confirm-gated SMTP send is in. POP ingest is next, then IMAP folders / APPEND for Sent.
3. **Staff last, behind a switch.** Mail works with zero AI. Then: BYOK settings (provider + key + model), then one capability (summarize this message), then drafts that open in the reader before send. Then Stories and Brief. Same staff interface regardless of mailbox or LLM vendor. Batch-on-sync is an opt-in, not the default. Co-Pilot stays a drawer until there is a next action.

No Gmail API. No Microsoft Graph. No bundled inference, no our-cloud proxy. If a host only speaks a proprietary mail API and not IMAP/POP, it is out of scope. The product is Outlook-shaped: add any email, read it as a magazine, hire staff if you want.
