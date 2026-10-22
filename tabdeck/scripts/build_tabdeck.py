#!/usr/bin/env python3
"""Build a personalised TabDeck Chrome extension.

Usage:
  python3 build_tabdeck.py --answers answers.json --lessons lessons.json --out OUTPUT_DIR

answers.json  the person's choices (see examples/answers.example.json)
lessons.json  the daily lessons Claude wrote for them (see references/lesson-format.md)

Writes OUTPUT_DIR/TabDeck-<name>/ and OUTPUT_DIR/TabDeck-<name>.zip, and prints a short report.
Exits with a clear message (and writes nothing) if anything is invalid.
"""
import argparse
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "template"

VARS = ["page", "card", "cline", "chip", "ink", "muted", "faint", "accent", "accent-soft", "close", "close-soft",
        "ok", "ok-soft", "warn", "warn-soft", "mint", "peach", "sky", "butter", "lilac"]


def pal(s):
    vals = s.split()
    assert len(vals) == len(VARS), (len(vals), s)
    return dict(zip(VARS, vals))


THEMES = {
    "korean-pastel": {
        "label": "Korean pastel: soft lilac, mint and peach, rounded and friendly",
        "font": "Nunito", "font_css": "Nunito:wght@400;600;700;800;900",
        "light": pal("#FBFCFF #FFFFFF #ECEFF6 #EEF1F8 #33354A #7B809A #A7ACC0 #7C6CF2 #EFECFF #F26B7E #FFEEF1 "
                     "#25A182 #E0F6EF #C98A1E #FFF5DB #D8F3EA #FFE6DC #E1EDFF #FFF4CC #ECE7FF"),
        "dark": pal("#1A1C30 #23263C #33375A #2B2E48 #ECEBFA #A9ACC9 #7D81A3 #B3A8FF #2E2A55 #FF9AA8 #3D2232 "
                    "#7FE0C3 #173A33 #F5C26B #3A3020 #1D3A35 #3E2B2A #1F2D4A #3A3422 #2C2850"),
    },
    "midnight-neon": {
        "label": "Midnight neon: always dark, purple and cyan glow",
        "font": "Sora", "font_css": "Sora:wght@400;600;700;800",
        "light": None,  # dark in both modes
        "dark": pal("#0E0B1F #17132E #2C2652 #221C42 #F1EEFF #A59FD0 #7A73A8 #B76CFF #2B1F52 #FF6B9A #3A1830 "
                    "#4DE3C1 #10332D #FFC857 #3A3018 #12302C #3A2226 #172647 #3A3218 #2A1E4E"),
        "shadow": "0 10px 30px rgba(183,108,255,.18)",
    },
    "clean-minimal": {
        "label": "Clean minimal: black, white and grey, nothing extra",
        "font": "IBM Plex Sans", "font_css": "IBM+Plex+Sans:wght@400;500;600;700",
        "light": pal("#FAFAFA #FFFFFF #E6E6E6 #F1F1F1 #1C1C1C #6B6B6B #9C9C9C #1C1C1C #EFEFEF #D9480F #FDEDE5 "
                     "#2F9E44 #E8F5EA #B7791F #FBF3E2 #EEF5F0 #FBEFEA #EEF2F7 #FAF5E6 #F0EFF5"),
        "dark": pal("#121212 #1B1B1B #2C2C2C #242424 #EDEDED #A3A3A3 #737373 #EDEDED #2A2A2A #FF8A5C #3A2218 "
                    "#69DB7C #183020 #F2C14E #352C17 #1B2A20 #33241D #1D2633 #312B1A #26243A"),
    },
    "kopitiam-retro": {
        "label": "Kopitiam retro: warm cream, tile green and chilli red",
        "font": "Rubik", "font_css": "Rubik:wght@400;500;600;700;800",
        "light": pal("#FBF6EC #FFFDF8 #E9DFC9 #F3EBDA #2E2A24 #7D7261 #A79C88 #1F7A5A #E2F1EA #C8402F #FBE6E1 "
                     "#1F7A5A #E2F1EA #B9770E #FCEFD6 #E2F1EA #FBE6DA #E4EEF3 #FCEFC9 #EFE8F1"),
        "dark": pal("#1D1A16 #26221C #3A342A #2F2A22 #F3ECDF #BDB19C #8C826F #5CC79A #1E3A2E #F08A7B #3E231E "
                    "#5CC79A #1E3A2E #E8B04E #3A2F18 #1E3A2E #3A2A22 #1F2E35 #3A3220 #2E2733"),
    },
    "forest-calm": {
        "label": "Forest calm: sage and moss greens, quiet and easy on the eyes",
        "font": "Lexend", "font_css": "Lexend:wght@400;500;600;700",
        "light": pal("#F5F8F3 #FFFFFF #DDE7D8 #EAF1E6 #23312A #667A6E #95A69A #3F7D5B #E3F0E8 #C45A4A #F8E6E2 "
                     "#3F7D5B #E3F0E8 #B4832C #F7EEDB #E3F0E8 #F6E8DF #E3EDF2 #F5F0DA #ECE9F2"),
        "dark": pal("#141B17 #1C2520 #2D3A32 #24302A #E6EFE8 #A3B5A9 #73867A #8FD1AB #22382C #F09A8C #3A2420 "
                    "#8FD1AB #22382C #E5BE6E #3A311C #22382C #36291F #1D2C33 #36321E #2A2733"),
    },
}

FEEDS = {
    # verified: these were loaded successfully when TabDeck was built
    "techcrunch-ai": ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "https://techcrunch.com/category/artificial-intelligence/"),
    "mittr-ai": ("MIT Technology Review AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed", "https://www.technologyreview.com/topic/artificial-intelligence/"),
    # widely used public feeds: if one does not load, TabDeck says so and links to the site
    "verge": ("The Verge", "https://www.theverge.com/rss/index.xml", "https://www.theverge.com/"),
    "ars": ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", "https://arstechnica.com/"),
    "hackernews": ("Hacker News", "https://hnrss.org/frontpage", "https://news.ycombinator.com/"),
    "bbc-world": ("BBC News", "https://feeds.bbci.co.uk/news/rss.xml", "https://www.bbc.com/news"),
    "bbc-business": ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "https://www.bbc.com/news/business"),
    "sciencedaily": ("ScienceDaily", "https://www.sciencedaily.com/rss/top.xml", "https://www.sciencedaily.com/"),
    "smashing": ("Smashing Magazine (design)", "https://www.smashingmagazine.com/feed/", "https://www.smashingmagazine.com/"),
}

EFFECTS = ["plane", "sweep", "crumple", "fade"]
SOUNDS = ["match", "pop", "kaching", "arcade", "off"]
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def fail(msg):
    sys.exit(f"Cannot build TabDeck: {msg}")


def mix(hex_a, hex_b, t):
    a = [int(hex_a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def theme_css(choice):
    if isinstance(choice, str):
        choice = {"base": choice}
    base = choice.get("base", "korean-pastel")
    if base not in THEMES:
        fail(f'unknown look "{base}". Pick one of: {", ".join(THEMES)}')
    th = THEMES[base]
    light = dict(th["light"] or th["dark"])
    dark = dict(th["dark"])
    accent = choice.get("accent")
    if accent:
        if not HEX.match(accent):
            fail(f'accent colour "{accent}" must look like #7C6CF2')
        light["accent"], light["accent-soft"] = accent, mix(accent, light["card"], 0.88)
        dark["accent"], dark["accent-soft"] = mix(accent, "#FFFFFF", 0.35), mix(accent, dark["card"], 0.75)
    font = choice.get("font") or th["font"]
    font_css = th["font_css"] if font == th["font"] else font.replace(" ", "+") + ":wght@400;600;700;800"
    shadow = th.get("shadow")

    def block(v, scheme):
        lines = "; ".join(f"--{k}:{v[k]}" for k in VARS)
        extra = f"; --shadow:{shadow}" if shadow else ""
        return f"color-scheme:{scheme}; {lines}{extra}; --sans:\"{font}\",\"Segoe UI\",system-ui,-apple-system,Roboto,Arial,sans-serif"

    css = (f"/* TabDeck look: {base}{' + accent ' + accent if accent else ''} */\n"
           f":root{{{block(light, 'dark' if th['light'] is None else 'light')}}}\n"
           f"@media (prefers-color-scheme: dark){{:root{{{block(dark, 'dark')}}}}}\n")
    link = f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family={font_css}&display=swap">'
    return css, link, base


def news_sources(sel):
    if not sel:
        sel = ["techcrunch-ai"]
    out = {}
    for item in sel[:4]:
        if isinstance(item, str):
            if item not in FEEDS:
                fail(f'unknown news source "{item}". Use one of {", ".join(FEEDS)} or give {{"label","url","home"}}')
            label, url, home = FEEDS[item]
            key = item
        else:
            label, url, home = item.get("label", ""), item.get("url", ""), item.get("home") or item.get("url", "")
            if not label or not urlparse(url).scheme == "https":
                fail(f"custom news source needs a label and an https:// feed url: {item}")
            key = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or "custom"
        out[key] = {"label": label, "url": url, "home": home}
    return out


def check_lessons(data):
    topics = data.get("topics") if isinstance(data, dict) else None
    if not isinstance(topics, dict) or not topics:
        fail('lessons.json needs {"topics": {"<key>": {...}}} with at least one topic')
    problems = []
    for key, tp in topics.items():
        if not re.fullmatch(r"[a-z0-9-]{2,30}", key):
            problems.append(f'topic key "{key}" must be lowercase letters, digits or dashes')
        for f in ("label", "items"):
            if f not in tp:
                problems.append(f'topic "{key}" is missing "{f}"')
        items = tp.get("items", [])
        if len(items) < 5:
            problems.append(f'topic "{key}" has {len(items)} lessons; write at least 5 (7 is best: one per day of the week)')
        for n, it in enumerate(items, 1):
            where = f'topic "{key}" lesson {n}'
            for f in ("title", "phrases", "tryit", "quiz"):
                if not it.get(f):
                    problems.append(f"{where} is missing {f}")
            ph = it.get("phrases", [])
            if not (2 <= len(ph) <= 4) or any(not isinstance(p, list) or len(p) != 3 or not all(isinstance(x, str) and x.strip() for x in p) for p in ph):
                problems.append(f"{where}: phrases must be 2-4 lists of exactly 3 non-empty texts [main, how to say it or example, meaning]")
            q = it.get("quiz", {})
            opts, a = q.get("opts", []), q.get("a")
            if not q.get("q") or not (2 <= len(opts) <= 4) or not isinstance(a, int) or not (0 <= a < len(opts)):
                problems.append(f"{where}: quiz needs q, 2-4 opts and a = index of the right option")
    if problems:
        fail("lessons.json has problems:\n- " + "\n- ".join(problems[:20]))
    return topics


def js_const(name, value):
    return f"const {name} = {json.dumps(value, ensure_ascii=False, indent=1)};\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--answers", required=True)
    ap.add_argument("--lessons", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    ans = json.loads(Path(args.answers).read_text(encoding="utf-8"))
    lessons = json.loads(Path(args.lessons).read_text(encoding="utf-8"))

    name = str(ans.get("name") or "").strip()[:30]
    css, font_link, base = theme_css(ans.get("theme", "korean-pastel"))
    news = news_sources(ans.get("news"))
    topics = check_lessons(lessons)
    effect = ans.get("effect", "plane")
    sound = ans.get("sound", "match")
    if effect not in EFFECTS:
        fail(f'effect must be one of {EFFECTS}')
    if sound not in SOUNDS:
        fail(f'sound must be one of {SOUNDS}')
    cfg = {
        "greeting": str(ans.get("greeting") or (f"Hi {name}, here are your tabs" if name else "Your tabs"))[:60],
        "newsLabel": str(ans.get("newsLabel") or "📰 News today")[:40],
        "learnIcon": str(ans.get("learnIcon") or "🗣️")[:4],
        "effect": effect, "sound": sound,
    }

    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-") or "personal"
    out_dir = Path(args.out) / f"TabDeck-{slug}"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    shutil.copytree(TEMPLATE, out_dir)
    html = (out_dir / "newtab.html").read_text(encoding="utf-8").replace("{{FONT_LINK}}", font_link)
    (out_dir / "newtab.html").write_text(html, encoding="utf-8")
    (out_dir / "theme.css").write_text(css, encoding="utf-8")
    (out_dir / "config.js").write_text(
        "// Made for " + (name or "you") + " by the TabDeck skill. Rebuild with the skill to change it.\n"
        + js_const("TD_CONFIG", cfg) + js_const("TD_LANGS", topics) + js_const("TD_NEWS", news), encoding="utf-8")

    origins = sorted({f"{urlparse(v['url']).scheme}://{urlparse(v['url']).netloc}/*" for v in news.values()})
    manifest = {
        "manifest_version": 3,
        "name": "TabDeck" + (f" for {name}" if name else ""),
        "version": "2.0.0",
        "description": "Every new tab shows your open tabs as cards grouped by website, plus your daily news and a 3-minute lesson.",
        "chrome_url_overrides": {"newtab": "newtab.html"},
        "permissions": ["tabs", "storage", "alarms", "notifications"],
        "host_permissions": origins,
        "background": {"service_worker": "background.js"},
        "icons": {"16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png"},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    first_topic = next(iter(topics.values()))
    install = f"""TabDeck for {name or 'you'}
{'=' * (11 + len(name or 'you'))}

Your look: {THEMES[base]['label']}
Your daily lesson: {', '.join(t['label'] for t in topics.values())} ({len(first_topic['items'])} lessons, one a day)
Your news: {', '.join(v['label'] for v in news.values())}

Install (2 minutes, Chrome or Edge)
1. Unzip this folder and keep it somewhere it will stay, e.g. Documents/{out_dir.name}.
   Chrome loads it from there, so don't delete or move it later.
2. Open chrome://extensions   (Edge: edge://extensions)
3. Turn on "Developer mode" (top right).
4. Click "Load unpacked" and choose this folder (the one with manifest.json in it).
5. Open a new tab. If Chrome asks whether to keep the new-tab page change, choose "Keep it".

Using it
- Every new tab shows your open tabs as cards, grouped by website. ✕ closes one, "Close all" closes a card.
- 🔖 saves a page for later; 📦 bundles a card; ⏰ reminds you later with a notification.
- Top row: today's news, today's 3-minute lesson (tap "Learn now"), and something you saved earlier.
- 🎁 Tab Wrapped shows your week. Pick a close effect and sound at the top right.
- Everything stays on this computer. TabDeck never reads your browsing history.

Change something later: ask Claude to run the TabDeck skill again, then on chrome://extensions
click "Remove" on the old TabDeck and "Load unpacked" for the new folder.
"""
    (out_dir / "INSTALL.txt").write_text(install, encoding="utf-8")
    zpath = Path(args.out) / f"{out_dir.name}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out_dir.rglob("*")):
            if f.is_file():
                z.write(f, Path(out_dir.name) / f.relative_to(out_dir))
    lesson_count = sum(len(t["items"]) for t in topics.values())
    print(f"Built {zpath}\n  look: {base}  font: {font_link.split('family=')[1].split(':')[0].replace('+', ' ')}"
          f"\n  topics: {', '.join(topics)} ({lesson_count} lessons)\n  news: {', '.join(v['label'] for v in news.values())}"
          f"\n  greeting: {cfg['greeting']}\n  close effect: {effect}, sound: {sound}")


if __name__ == "__main__":
    main()
