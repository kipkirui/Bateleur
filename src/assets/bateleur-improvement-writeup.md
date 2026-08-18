# Making Bateleur More Productive — and Less Boring

*A writeup based on the current shipped state and roadmap in `STATUS.md` and `Make Email Great Again.md`.*

Bateleur's thesis is strong: local-first, BYOK, magazine-style reading, no dark patterns, no fake data. The risk with that thesis is that "calm and honest" quietly becomes "flat and forgettable." The two goals — more productive, less boring — aren't in tension; they're usually the same fix. A tool feels boring when it asks you to do manual work that software should be doing, and it feels productive when the software visibly does that work *for* you in a way you can see and trust. Below is a set of concrete directions, grouped by what they actually change for the user.

---

## 1. Make the Action/Reading split *earn* its keep

Right now this is local heuristics (2FA codes, invoices, "please reply" phrases). This is the single most important surface in the app — it's the whole "you're the editor" pitch — and it's currently invisible in its reasoning and static in its behavior.

**Productivity fixes:**
- **Per-sender learning.** If a user moves a newsletter from Action to Reading twice, that sender should never land in Action again without being told. This is a few lines of SQLite state, not a model — cheap win, big trust payoff.
- **Confidence-based third bucket.** Instead of a binary split, add a quiet "Uncertain" tray for borderline mail rather than silently guessing wrong. Wrong guesses that a user *can't see or correct* are what make heuristic classifiers feel untrustworthy.
- **Explainability on hover/click.** "Why is this in Action?" → "Contains a deadline phrase + sender not in your contacts." This single feature does double duty: it's a debugging tool for you and a trust-builder for the user.

**Delight fix:** this classification is the one place in the app where showing your work turns a boring filing operation into something that feels like a colleague triaging your inbox, not a spam filter.

---

## 2. Turn the "magazine feed" into something people actually browse

The magazine metaphor is the most distinctive idea in the product, but per `STATUS.md` it's currently: left rail, center feed, day/night paper toggle. That's a *skin*, not yet a magazine experience.

- **Real typographic hierarchy.** Vary type size/weight by signal — a "please reply" from your manager should not be visually equal to a shipping notification. Magazines use type scale to tell you what matters before you read a word; email clients almost never do this.
- **Pull quotes / lede extraction for long mail.** For long newsletters or FYI threads, surface the first meaningful sentence (not the tracking-pixel preheader garbage most senders inject) as a genuine subhead in the feed.
- **Visual grouping by story, not just Action/Reading.** A thread with 14 replies and 3 forwarded FYIs about the same topic reads like a magazine "developing story," not a flat list. This is listed under staff/pending ("Stories: pin/rename/merge") — worth pulling forward because it's a layout win even before AI writes anything.
- **Day/night paper is good — extend it.** Consider a small number of curated "paper stocks" (e.g., cream/charcoal is listed; a high-contrast newsprint variant, a warm sepia) rather than a binary toggle. Low effort, high perceived craft.

---

## 3. Give the inbox a sense of *momentum*

Nothing in the shipped feature list currently tells the user "you're making progress" or "this is done." That absence is a big part of why triage tools feel like drudgery — there's no signal that the pile is shrinking.

- **Session summary on close/idle.** "You cleared 12, flagged 3, archived 9 today." Not gamified points — just an honest, quiet receipt. This matches the project's "no fake Balance %" stance perfectly: it's not manipulative because it's true.
- **Waiting-on that actually surfaces.** `STATUS.md` says waiting-on is a manual flag with no automation yet. Even without AI, a simple rule ("you sent a reply, no response in 4 days") turning into a passive nudge in a dedicated "Waiting On" rail column would make the tool feel like it's tracking your open loops instead of you having to remember them.
- **Empty-state that isn't empty.** When Action is cleared, don't just show blank space — a calm "Nothing needs you right now" state closes the loop emotionally, the way a magazine's last page does.

---

## 4. Compose should feel like *writing*, not filling a form

Compose overlay exists (Cmd+N) but nothing in the shipped list suggests it's differentiated from any other client's compose box.

- **Distraction-free full-bleed compose mode**, toggleable, that hides the rail/feed entirely — useful for anything longer than two sentences.
- **Quote-reply that's actually readable.** Most clients dump `>` prefixed walls of text. A magazine-styled block-quote treatment for the reply chain (collapsed by default, expandable) would match the reading experience and reduce visual noise.
- **Template/signature snippets** stored locally — not AI, just a `/` or `::` trigger for canned openers ("Thanks for reaching out," "Following up on this,"). This is the most requested feature in almost every "power user" email client and it's currently absent from the roadmap entirely.

---

## 5. Keyboard-first users are your power users — invest disproportionately there

Shipped keybinds (j/k, Enter, r, c, e, u, s, Ctrl+K, Esc) are a solid Vim-adjacent baseline. To make it feel *fast* rather than merely navigable:

- **Command palette beyond search** — Ctrl+K currently implies search; extend it to a true command palette (archive all in Reading, jump to account, toggle plain text) the way Superhuman/Linear do. This is one of the highest ROI "feels fast" investments in any productivity tool.
- **Undo, universally.** Archive, flag, and send should all be undoable via a toast + `z`, not just a confirm-before dialog. Confirm-before (already used for Send) is safe but slow; undo-after is safe *and* fast. This is worth prioritizing before more features, since it changes the felt speed of every single action in the app.
- **Multi-select triage** (`x` to select, then bulk archive/flag) — currently every action reads as single-message only.

---

## 6. Close the "toy vs. daily driver" gap (your own roadmap already knows this)

This isn't about boring vs. exciting, but it's the precondition for anyone experiencing the exciting parts at all:

- **Signed installers + auto-updater** — already flagged as pending, correctly. Nothing above matters if the only way to run the app is `npm run tauri dev`.
- **Search backend (SQLite FTS5)** — Ctrl+K is bound but no indexed full-text search is listed as shipped. This will be the first thing a daily-driver user hits a wall on.
- **Second-account UX decision** (unified vs. per-account) — also already flagged. Worth doing before Stories/BYOK, since most people who'd love a magazine-style client are exactly the people juggling 2–3 inboxes.

---

## Suggested sequencing

| Priority | Theme | Why first |
|---|---|---|
| 1 | Undo everywhere + multi-select | Cheapest change with the biggest "feels fast" payoff |
| 2 | Search (FTS5) + signed installers | Blocking issues for daily use, already on your roadmap |
| 3 | Per-sender learning + classification explainability | Makes the core conceit trustworthy, not just clever |
| 4 | Session receipts + waiting-on nudges | Turns triage into visible progress, no AI required |
| 5 | Typographic hierarchy + story grouping | The magazine metaphor starts paying off visually |
| 6 | Compose mode + snippets | Rounds out the "daily driver" feeling |
| 7 | Staff/BYOK features | As already sequenced — mail should feel great *before* AI touches it |

The throughline: almost everything here is achievable without AI or the "staff" layer at all — which fits the project's own stated principles (no fake data, no auto-send, no proxying inference). The "less boring" fix is mostly about giving the interface a sense of *causality* — the user does something, the app visibly responds, remembers, and moves on — rather than adding decoration on top of a static list view.
