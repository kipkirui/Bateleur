# Making Bateleur More Productive — and Less Boring

*A writeup based on the product thesis. Updated 18 Aug 2026 against [`STATUS.md`](../../STATUS.md).*

Bateleur's thesis is strong: local-first, BYOK, magazine-style reading, no dark patterns, no fake data. The risk with that thesis is that "calm and honest" quietly becomes "flat and forgettable." The two goals — more productive, less boring — aren't in tension; they're usually the same fix. A tool feels boring when it asks you to do manual work that software should be doing, and it feels productive when the software visibly does that work *for* you in a way you can see and trust.

Much of the original list below has shipped. Keep this note as design direction; do not treat unchecked history as the roadmap.

## Now shipped

Per-sender Reading lock (move twice), **Why here?**, magazine cover / briefing / Reading digest, story stacks (pin / rename / merge / not a story), session receipts, Awaiting reply, Uncertain tray, empty Action copy, Compose Focus, collapsed quote-reply, local snippets, Ctrl+K as search + commands, undo (`z`), multi-select (`x`), FTS5 search, unified vs per-account, Reply all / Forward, Cc / Bcc, Save draft, Morning Brief (eight unread Action letters; a line leaves once you read it), paper stocks (cream, newsprint, sepia, night), Back issues shelf, clippings from selected text.

## Still open

- OS-signed installers (Apple notarization / Windows Authenticode still need certs). Unsigned Windows MSI, NSIS setup, and a portable exe are in `prebuilt/windows`. Auto-updater checks GitHub Releases
- Calendar protocol (CalDAV / Google) — Radar stays invites already in mail
- Mobile shell (background IMAP and push)

The Design section still stands as how Magazine should *feel*. Raw stays the MIME escape hatch.

---

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

- **Signed installers + auto-updater** — unsigned Windows drops are in `prebuilt/windows`; Authenticode and Apple notarization still need certs. Auto-updater is wired to GitHub Releases.
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

# Design

How Bateleur should look and read. This extends the product thesis in
`Make Email Great Again.md` with the concrete UI direction — the goal is
that at every point where email has a natural editorial analog, we take
it. This is what separates the app from "Outlook with rounded corners."

## Philosophy

Mail is not a queue of identical rows. A receipt and a message from your
manager are not the same weight, and the UI should stop pretending they
are. The magazine metaphor already in the shell (paper tokens, Magazine
vs Raw toggle) should extend past the color scheme into layout,
typography, and information architecture — not just skin the existing
row-based feed.

## Feed: cards, not rows

**Action feed.** Each item is a full card, not a row:
- Sender avatar (initials circle, tinted with `--bg-accent`)
- A category badge, derived from classification (`Receipt`, `Invoice`,
  `Please reply`, …) — replaces the current dead `none` label
- Preview line (first meaningful sentence, not the tracking-pixel
  preheader most senders inject)
- Inline actions on the card itself: Archive, Reply — clearing Action
  should not require opening the message first
- A quiet `Why here?` affordance that surfaces the classifier's reason
  (see Classification transparency, below)

**Reading feed.** Stays a compact row — avatar, sender, one-line
subject/preview, date. Giving digest mail the same visual weight as
Action mail would add noise, not clarity. The two-tier weight (one big
card vs. a stack of compact rows) is what communicates priority through
layout instead of labels alone.

**Front page over flat list.** Rather than Action and Reading being two
undifferentiated lists, the feed should read like a homepage: one lead
item gets the full card treatment, the rest sit in a tighter "briefing"
strip beneath it. Not everything in Action is equally urgent, and the
layout should say so before the copy does.

## Reader: article, not viewer

Opening a message should feel like opening a post, not a raw MIME dump:
- Byline: avatar, sender name, **send frequency** ("emails you ~1x/month"
  — a small, honest signal of legitimacy that costs nothing to compute
  from send history already in SQLite), timestamp, category badge
- Serif headline (`--font-voice`) instead of the subject line rendered
  as plain UI text
- **Reading time estimate** under the headline (word count / average
  reading speed — trivial to compute, meaningfully useful on long
  newsletters)
- **Pull-quote lede** — the first meaningful sentence rendered as a
  blockquote, the way a magazine article opens with its strongest line
- Body copy in `--font-voice` at 15–16px, 1.7 line-height
- Footer actions (Archive, Reply, Plain text toggle)
- **"More from this sender"** rail — recent messages from the same
  address, the way an article ends with related posts

## Classification transparency

The Action/Reading split is the core editorial claim of the app ("you
are the editor"), so it has to show its work or it's just an opaque spam
filter with better branding.
- `Why here?` on every Action card opens a one-line explanation: which
  signal fired (deadline phrase, sender not in contacts, invoice
  pattern, …)
- Per-sender correction should stick: if a user moves a sender from
  Action to Reading twice, stop guessing Action for that sender without
  being told again

## Sender pages

Clicking a sender name should not just filter the feed — it should land
on something closer to an author page: every message from them, their
send frequency, and a mute/unsubscribe action right there. This turns
"who's emailing me" from metadata into something manageable, the way
you'd manage a blog subscription rather than dig through a contact list.

## Long threads: table of contents

A thread with a dozen+ replies should render with numbered sections and
jump links — the way a long article gets headers — instead of a scroll
of nested quote blocks. Story grouping (see `STATUS.md` pending list:
pin / rename / merge stories) is the natural backend for this; the TOC
is the reader-facing payoff.

## Archive as back issues

The archive/history view should read like a "previously read" shelf —
chronological, with the same headline treatment as the live feed — not
a folder tree. Revisiting old mail should feel like browsing back
issues, not digging through Sent/Archive folders.

## Highlights

Selecting text in a letter and **Keep** saves it to a lightweight clippings
list (confirmation numbers, addresses, dates). That is a "keep this"
affordance, not a notes product — 200 clips, 400 characters, local SQLite.
The letter iframe stays `sandbox="allow-same-origin"` with no scripts;
parent JS reads the selection from `contentDocument`.

## Non-goals

Consistent with `STATUS.md`'s "deliberately out of scope": no fake
engagement mechanics (read counts, streaks, unlockables). Reading time
and send frequency are informational, not gamified — they should read
as quiet facts, not achievements. No auto-send in this layer either;
inline card actions (Archive, Reply) still open the existing
confirm-gated send flow.

## Implementation notes

- Card and reader layouts are additive to the existing shell (rail +
  feed + reader), not a rewrite — `Magazine` view gains the card/article
  treatment; `Raw` view stays as the escape hatch to plain MIME.
- Category badges, reading time, and send frequency are all derivable
  from data already being cached (classification heuristics, MIME word
  count, per-sender message history in SQLite) — no new sync surface
  required.
- `Why here?` and sender pages both read from the same classification
  metadata; store the matched signal(s) alongside the Action/Reading
  label at classify time rather than recomputing on click.
