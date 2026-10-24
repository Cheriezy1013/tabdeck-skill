---
name: tabdeck
description: Builds a personalised TabDeck Chrome extension, a new-tab page that turns open tabs into cards and adds daily news and a 3-minute lesson. Asks a few questions first, then delivers a ready-to-install zip.
---

# TabDeck: a personal new-tab page

TabDeck replaces Chrome's new-tab page. Every new tab shows:

- **Your open tabs as cards, grouped by website.** Close one tab, a whole card, all duplicates or tabs untouched for 2+ days, with satisfying close effects and sounds. Undo is always there.
- **🔖 Save for later, 📦 bundle, ⏰ remind me**: tabs close but come back when needed, with a desktop notification for reminders.
- **A top row made for this person**: today's news from the sources they like, a 3-minute daily lesson in what they are learning (with read-aloud, a quick quiz and a streak), and something they saved earlier.
- **🎁 Tab Wrapped**: their week in tabs.

Everything stays on their computer. It never reads browsing history. Works in desktop browsers built on Chrome: Chrome, Edge, Brave, Arc, Opera, Vivaldi. It does not work in Firefox, Safari or on phones; if the person only uses those, say so before asking the questions, and suggest Chrome or Edge just for TabDeck.

Your job: ask a few questions, write their lessons, run the build script, and hand over the zip with clear install steps. The person should have TabDeck running within about 5 minutes.

## 1. Say what it is, then ask (one round)

Start with two sentences on what TabDeck does, then ask everything in **one round**. If an `AskUserQuestion` tool is available, use it (up to 4 questions, multiple choice, the person can always type their own answer). Otherwise ask in chat as a short numbered list. Don't ask more than this unless an answer leaves you unable to build.

1. **Look**: "Which style should your new tab have?"
   - Korean pastel (soft lilac, mint and peach)
   - Midnight neon (always dark, purple glow)
   - Clean minimal (black, white, grey)
   - Kopitiam retro (warm cream, tile green, chilli red)
   - Forest calm (sage greens)
   - They can also name their own colour (e.g. "my company's orange #F26A21"), which becomes the accent on top of the closest style.
2. **Learning**: "What are you learning right now, or want to learn a little of every day?" Offer a few common ones (Korean, Japanese, Mandarin, a work skill like Excel) and let them type anything: a language, a tool, a hobby, investing, photography... Ask for their level in the same question if you can (new to it / know the basics / intermediate), and why, if they want to say (a trip, work, fun). The why makes the lessons personal.
3. **Interests for the news card**: "What would you like to see in the morning?" Up to 2 of: AI and tech, business and markets, world news, science, design, or a site they already read. Map to keys in `references/news-feeds.md`.
4. **Feel**: "How should closing tabs feel?" Paper plane with a sound (default) / Arcade sounds / Quiet fade, no sound / Sweep away.

Also use their first name for the greeting if you know it or they mention it ("Hi Cherie, here are your tabs"). Don't ask for it separately; leave it out if you don't know it.

If they only want the tab cleanup, with no news and no lessons, put `"mode": "tabs-only"` in answers.json and skip lessons.json (run the build without `--lessons`). Less is more: offer this when they seem overwhelmed.

If they say "just pick for me", choose Korean pastel, TechCrunch AI, paper plane, and ask only what they're learning, since the lessons can't be guessed.

## 2. Write the two input files

In your working directory:

**answers.json** (see `examples/answers.example.json`):

```json
{
  "name": "Cherie",
  "greeting": "Hi Cherie, here are your tabs",
  "theme": "korean-pastel",
  "news": ["techcrunch-ai", "bbc-business"],
  "newsLabel": "🤖 AI and business today",
  "learnIcon": "🗣️",
  "effect": "plane",
  "sound": "match"
}
```

- `theme`: one of `korean-pastel`, `midnight-neon`, `clean-minimal`, `kopitiam-retro`, `forest-calm`, or `{"base": "clean-minimal", "accent": "#F26A21"}` for their own colour. `"font": "Some Google Font"` can be added to the object if they ask for a font.
- `news`: keys from `references/news-feeds.md`, or `{"label", "url", "home"}` for a site they named (an https RSS or Atom feed).
- `learnIcon`: one emoji for the lesson card, matching the topic (🗣️ language, 📊 Excel, 📷 photography, 💹 investing, 🎸 music...).
- `effect`: `plane`, `sweep`, `crumple` or `fade`. `sound`: `match` (fits the effect), `pop`, `kaching`, `arcade` or `off`.

**lessons.json**: write 7 lessons for what they're learning, at their level. **Read `references/lesson-format.md` first**: it has the exact shape and the writing rules (3 phrases, one try-it, one quiz per lesson; accurate; your own words). `examples/lessons.example.json` is a full Korean set you can use as a model; if they're learning Korean as a beginner, you may reuse it.

## 3. Build

```bash
python3 <this skill's directory>/scripts/build_tabdeck.py --answers answers.json --lessons lessons.json --out .
```

It writes `TabDeck-<Name>/` and `TabDeck-<Name>.zip` and prints a short report. If it refuses ("Cannot build TabDeck: ..."), the message says exactly what to fix in your JSON; fix it and run again. Don't edit the template files.

## 4. Hand it over

Send the zip as a file. Then, in your reply, keep it short and concrete:

1. What you made for them, in one line (their style, their lesson topic, their news).
2. **Install, about 2 minutes** (the same steps are in `INSTALL.txt` inside the zip):
   1. Unzip it and keep the folder somewhere it will stay, e.g. Documents. Chrome loads it from there, so it must not be moved or deleted.
   2. Open the browser's extensions page: `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
   3. Turn on **Developer mode** (top right).
   4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
   5. Open a new tab. If Chrome asks whether to keep the new-tab page change, choose **Keep it**.
3. **First things to try**: open a few tabs, then a new tab; tap ✕ on one (enjoy the effect); tap **Learn now** for today's lesson; tap 🔖 on a tab you want to read later.
4. **To change anything later**: ask again with this skill. Then on `chrome://extensions`, click **Remove** on the old TabDeck and **Load unpacked** for the new folder. Their saved pages and streak are stored by the old copy, so mention they'll start fresh.

Mention these only if they apply:
- A work laptop may block **Load unpacked** (company policy). They should check with IT or use a personal computer; don't suggest ways around it.
- The news needs an internet connection; lessons work offline.
- Memory numbers in Tab Wrapped are rough estimates.

## Things not to do

- Don't promise features TabDeck doesn't have (AI summaries of tabs, syncing across computers, mobile).
- Don't put the person's private details anywhere except the greeting name.
- Don't invent news feed URLs you aren't sure of; use the table, or tell them how to find their site's feed.
