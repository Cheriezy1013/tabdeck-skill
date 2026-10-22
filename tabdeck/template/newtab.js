// TabDeck new-tab page: lays out every open tab as cards grouped by website.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DAY = 864e5, STALE = 2 * DAY, GB_PER_TAB = 0.09; // memory per tab is a rough estimate
const SELF_URL = chrome.runtime.getURL("newtab.html");

const CFG = typeof TD_CONFIG === "object" ? TD_CONFIG : {};
const FIRST = o => Object.keys(o)[0];
let selfId = null, tabs = [], born = {}, saved = [], week = null, settings = { effect: CFG.effect || "plane", sound: CFG.sound || "match" };
let lastClosed = [], animating = false, query = "";
let learn = { lang: FIRST(TD_LANGS), streak: 0, lastDone: "", news: FIRST(TD_NEWS) }, newsCache = null, newsState = "idle";

/* ---------- storage ---------- */
function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); }
async function loadStore() {
  const s = await chrome.storage.local.get(["born", "saved", "week", "settings", "learn", "newsCache"]);
  learn = { ...learn, ...(s.learn || {}) }; if (!TD_LANGS[learn.lang]) learn.lang = FIRST(TD_LANGS); if (!TD_NEWS[learn.news]) learn.news = FIRST(TD_NEWS);
  newsCache = s.newsCache || null;
  born = s.born || {}; saved = s.saved || []; settings = { ...settings, ...(s.settings || {}) };
  week = s.week && s.week.start === weekStart() ? s.week : { start: weekStart(), closed: 0, handled: [], siteMax: {}, peak: 0, peakAt: 0 };
}
const saveWeek = () => chrome.storage.local.set({ week });
const saveSaved = () => chrome.storage.local.set({ saved });

/* ---------- reading tabs ---------- */
function siteOf(url = "") {
  if (!url || url === "about:blank" || url.startsWith("chrome://newtab") || url === SELF_URL) return { key: "_new", name: "Empty new tabs" };
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") { const h = u.hostname.replace(/^www\./, ""); return { key: h, name: h }; }
    if (u.protocol === "file:") return { key: "_file", name: "Files on this computer" };
    return { key: "_" + u.protocol, name: u.protocol.replace(":", "") + " pages" };
  } catch (_) { return { key: "_other", name: "Other" }; }
}
const norm = url => (url || "").split("#")[0].replace(/\/$/, "");
function ago(ms) {
  const m = Math.round(ms / 6e4);
  if (m < 1) return "just now"; if (m < 60) return m + " min ago";
  const h = Math.round(m / 60); if (h < 24) return h + " h ago";
  const d = Math.round(h / 24); return d + (d === 1 ? " day ago" : " days ago");
}
async function readTabs() {
  const all = await chrome.tabs.query({});
  tabs = all.filter(t => t.id !== selfId).map(t => ({
    id: t.id, windowId: t.windowId, title: t.title || t.url || "Untitled", url: t.url || t.pendingUrl || "",
    fav: t.favIconUrl || "", pinned: t.pinned, audible: t.audible, active: t.active,
    used: t.lastAccessed || born[t.id] || Date.now(), born: born[t.id] || null, site: siteOf(t.url || t.pendingUrl)
  }));
  // duplicates: keep the most recently used copy, flag the rest
  const seen = new Map();
  [...tabs].sort((a, b) => b.used - a.used).forEach(t => {
    const k = t.site.key === "_new" ? null : norm(t.url);
    t.dup = !!(k && seen.has(k)); if (k && !seen.has(k)) seen.set(k, t.id);
  });
  tabs.forEach(t => { t.stale = Date.now() - t.used > STALE; t.safe = !t.pinned && !t.audible; t.sugg = t.safe && (t.dup || t.site.key === "_new"); });
  // weekly stats
  if (tabs.length > week.peak) { week.peak = tabs.length; week.peakAt = Date.now(); }
  const counts = {}; tabs.forEach(t => { if (!t.site.key.startsWith("_")) counts[t.site.key] = (counts[t.site.key] || 0) + 1; });
  for (const [k, n] of Object.entries(counts)) if (n > (week.siteMax[k] || 0)) week.siteMax[k] = n;
  saveWeek();
}
function groups() {
  const q = query.trim().toLowerCase(), map = new Map();
  tabs.filter(t => !q || t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q))
    .forEach(t => { if (!map.has(t.site.key)) map.set(t.site.key, { key: t.site.key, name: t.site.name, items: [] }); map.get(t.site.key).items.push(t); });
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/* ---------- rendering ---------- */
function favHtml(t, name) {
  return t.fav && /^(https?:|data:)/.test(t.fav) ? `<img src="${esc(t.fav)}" alt="">` : esc((name || "?").replace(/^_/, "").charAt(0).toUpperCase());
}
function chips(t) {
  const c = [];
  if (t.pinned) c.push(`<span class="chip c-keep">Pinned</span>`);
  if (t.audible) c.push(`<span class="chip c-live">Playing</span>`);
  if (t.active) c.push(`<span class="chip c-now">Open now</span>`);
  if (t.dup) c.push(`<span class="chip c-dup">Duplicate</span>`);
  if (t.stale) c.push(`<span class="chip c-stale">Untouched 2+ days</span>`);
  return c.join("");
}
function aboutText(g) {
  const n = g.items.length, d = g.items.filter(t => t.dup).length, s = g.items.filter(t => t.stale).length;
  if (g.key === "_new") return `${n} empty new tab${n > 1 ? "s" : ""}. Nothing to lose here.`;
  const bits = [`${n} tab${n > 1 ? "s" : ""}`];
  if (d) bits.push(`${d} duplicate${d > 1 ? "s" : ""}`);
  if (s) bits.push(`${s} untouched for 2+ days`);
  const oldest = Math.min(...g.items.map(t => t.used));
  return bits.join(" · ") + `. Oldest last used ${ago(Date.now() - oldest)}.`;
}
function cardHtml(g) {
  const d = g.items.filter(t => t.dup && t.safe).length, closable = g.items.filter(t => t.safe).length;
  return `<article class="card" data-card="${esc(g.key)}">
    <div class="card-h"><span class="fav">${favHtml(g.items.find(t => t.fav) || g.items[0], g.name)}</span>
      <span class="nm"><b title="${esc(g.name)}">${esc(g.name)}</b><span>${g.items.length > 1 ? "Same website, grouped" : "1 tab"}</span></span>
      <span class="count">${g.items.length}</span></div>
    <div class="about">${esc(aboutText(g))}</div>
    <ul class="list">${g.items.map(t => `<li class="li ${t.sugg ? "sugg" : ""}" data-li="${t.id}">
      <div><button class="go" type="button" data-go="${t.id}" title="${esc(t.url)}">${esc(t.title)}</button>
      <div class="meta">${chips(t)}<span>last used ${ago(Date.now() - t.used)}</span></div></div>
      <span class="rowbtns"><button class="x sv" type="button" data-save="${t.id}" aria-label="Save for later: ${esc(t.title)}" title="Save for later and close">🔖</button><button class="x" type="button" data-close="${t.id}" aria-label="Close ${esc(t.title)}" title="Close">✕</button></span></li>`).join("")}</ul>
    <div class="card-f">
      ${d ? `<button class="btn" type="button" data-dups="${esc(g.key)}">Close ${d} duplicate${d > 1 ? "s" : ""}</button>` : ""}
      <button class="btn danger" type="button" data-all="${esc(g.key)}" ${closable ? "" : "disabled"}>Close all ${closable}</button>
      ${g.key === "_new" ? "" : `<button class="btn" type="button" data-bundle="${esc(g.key)}" ${closable ? "" : "disabled"}>📦 Save as bundle</button>
      <select data-remind="${esc(g.key)}" aria-label="Remind me later and close" ${closable ? "" : "disabled"}>
        <option value="">⏰ Remind me…</option><option value="1h">In 1 hour</option><option value="tonight">Tonight, 8 pm</option><option value="tomorrow">Tomorrow, 9 am</option><option value="sat">Saturday, 10 am</option></select>`}
    </div></article>`;
}
function savedHtml() {
  if (!saved.length) return "";
  return `<h2>Saved for later <span>· closed safely, nothing lost</span></h2>` + saved.map(x => `<div class="srow">
    <span class="ic">${x.type === "remind" ? "⏰" : x.type === "page" ? "🔖" : "📦"}</span>
    <div><b>${esc(x.name)}</b><div class="d">${x.type === "remind" ? "Reminder " + new Date(x.when).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) + " · " : x.type === "page" ? "Saved page · " + esc(x.site || "") : "Bundle · "}${x.type === "page" ? "" : `${x.tabs.length} tab${x.tabs.length > 1 ? "s" : ""}`}</div></div>
    <button class="btn" type="button" data-reopen="${x.id}">${x.type === "page" ? "Open" : `Reopen ${x.tabs.length}`}</button>
    <button class="x" type="button" data-forget="${x.id}" aria-label="Remove ${esc(x.name)}">✕</button></div>`).join("");
}
function render() {
  renderLearn();
  const gs = groups();
  const dups = tabs.filter(t => t.dup && t.safe).length, stale = tabs.filter(t => t.stale && t.safe && !t.active).length;
  $("title").innerHTML = `${tabs.length} tabs open <span>· ${gs.length} website${gs.length === 1 ? "" : "s"}</span>`;
  $("summary").innerHTML = `<span><b>${dups}</b> duplicates</span><span><b>${stale}</b> untouched 2+ days</span><span>≈ <b>${(tabs.length * GB_PER_TAB).toFixed(1)} GB</b> memory (estimate)</span><span><b>${week.closed}</b> closed this week</span>`;
  $("closeDups").disabled = !dups; $("closeDups").textContent = dups ? `Close ${dups} duplicate${dups > 1 ? "s" : ""}` : "No duplicates";
  $("closeStale").disabled = !stale; $("closeStale").textContent = `Close tabs untouched 2+ days (${stale})`;
  $("saved").hidden = !saved.length; $("saved").innerHTML = savedHtml();
  $("grid").className = "grid fx-" + settings.effect;
  $("grid").innerHTML = gs.length ? gs.map(cardHtml).join("")
    : `<div class="empty"><b>${query ? "No tab matches that." : "Clean desk. 🎉"}</b>${query ? "" : "This is the only tab open."}</div>`;
  $("grid").querySelectorAll(".fav img").forEach(img => img.addEventListener("error", () => { img.replaceWith(document.createTextNode("•")); }));
}
async function refresh() { if (animating) return; await readTabs(); render(); }
let rT; const soon = () => { clearTimeout(rT); rT = setTimeout(refresh, 250); };

/* ---------- actions ---------- */
let toastT;
function toast(msg, undo) {
  const t = $("toast"); t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" id="undoBtn">Undo</button>` : ""}`;
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4500);
}
async function closeTabs(ids, label) {
  ids = ids.filter(id => tabs.some(t => t.id === id)); if (!ids.length) return;
  const closing = tabs.filter(t => ids.includes(t.id));
  TDSound.close(ids.length, tabs.length - ids.length === 0, settings.effect, settings.sound);
  animating = true;
  ids.forEach(id => { const li = document.querySelector(`[data-li="${id}"]`); li && li.classList.add("bye"); });
  groups().filter(g => g.items.every(t => ids.includes(t.id))).forEach(g => { const c = document.querySelector(`[data-card="${CSS.escape(g.key)}"]`); c && c.classList.add("bye"); });
  await new Promise(r => setTimeout(r, reduce ? 150 : settings.effect === "plane" ? 560 : 440));
  try { await chrome.tabs.remove(ids); } catch (_) { }
  lastClosed = closing.map(t => ({ url: t.url, pinned: t.pinned, windowId: t.windowId }));
  week.closed += closing.length; saveWeek();
  animating = false; await refresh();
  toast(`${label || "Closed"} ${closing.length} tab${closing.length > 1 ? "s" : ""}.`, true);
}
async function undo() {
  if (!lastClosed.length) return; const back = lastClosed; lastClosed = [];
  TDSound.rewind(settings.sound);
  for (const t of back) if (t.url && !t.url.startsWith("chrome://newtab")) await chrome.tabs.create({ url: t.url, active: false, pinned: t.pinned });
  week.closed = Math.max(0, week.closed - back.length); saveWeek();
  toast(`Reopened ${back.length} tab${back.length > 1 ? "s" : ""}.`);
}
function whenOf(v) {
  const d = new Date();
  if (v === "1h") return Date.now() + 36e5;
  if (v === "tonight") { d.setHours(20, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d.getTime(); }
  if (v === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
  if (v === "sat") { d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(10, 0, 0, 0); return d.getTime(); }
  return Date.now() + 36e5;
}
async function saveGroup(key, type, whenKey) {
  const g = groups().find(x => x.key === key); if (!g) return;
  const items = g.items.filter(t => t.safe); if (!items.length) return;
  const id = Math.random().toString(36).slice(2, 10);
  const entry = { id, type, name: g.name, tabs: items.map(t => ({ url: t.url, title: t.title })), at: Date.now() };
  if (type === "remind") { entry.when = whenOf(whenKey); chrome.alarms.create("remind:" + id, { when: entry.when }); }
  saved.unshift(entry); saveSaved();
  week.handled.push({ name: g.name, how: type }); saveWeek();
  await closeTabs(items.map(t => t.id), type === "remind" ? "Reminder set, closed" : "Bundled and closed");
}
async function savePage(tabId) {
  const t = tabs.find(z => z.id === tabId); if (!t) return;
  const id = Math.random().toString(36).slice(2, 10);
  saved.unshift({ id, type: "page", name: t.title, site: t.site.name, tabs: [{ url: t.url, title: t.title }], at: Date.now() });
  saveSaved();
  await closeTabs([t.id], "Saved for later and closed");
}
async function reopenSaved(id) {
  const x = saved.find(s => s.id === id); if (!x) return;
  TDSound.rewind(settings.sound);
  for (const t of x.tabs) await chrome.tabs.create({ url: t.url, active: false });
  saved = saved.filter(s => s.id !== id); saveSaved(); chrome.alarms.clear("remind:" + id);
  toast(`Reopened “${x.name}”: ${x.tabs.length} tabs.`);
}
function forgetSaved(id) { saved = saved.filter(s => s.id !== id); saveSaved(); chrome.alarms.clear("remind:" + id); render(); }


/* ---------- top: AI news + language lesson + saved ---------- */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const dayNum = (d = new Date()) => Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(2026, 0, 1)) / DAY);
const saveLearn = () => chrome.storage.local.set({ learn });
function todays(offset = 0) { const pack = TD_LANGS[learn.lang], n = pack.items.length; const i = ((dayNum() + offset) % n + n) % n; return { pack, i, item: pack.items[i] }; }
function streakNow() { const y = new Date(Date.now() - DAY); return (learn.lastDone === dayKey() || learn.lastDone === dayKey(y)) ? learn.streak : 0; }
const NEWS_TTL = 2 * 36e5;
const strip = h => { const d = new DOMParser().parseFromString(h || "", "text/html"); return (d.body.textContent || "").replace(/\s+/g, " ").trim(); };
async function loadNews(force) {
  const src = TD_NEWS[learn.news];
  if (!force && newsCache && newsCache.src === learn.news && Date.now() - newsCache.at < NEWS_TTL) return;
  newsState = "loading"; renderLearn();
  try {
    const r = await fetch(src.url, { cache: "no-store" }); if (!r.ok) throw new Error(r.status);
    const xml = new DOMParser().parseFromString(await r.text(), "text/xml");
    const rss = [...xml.querySelectorAll("item")], atom = rss.length ? [] : [...xml.querySelectorAll("entry")];
    const items = (rss.length ? rss : atom).slice(0, 6).map(it => {
      const g = n => it.querySelector(n)?.textContent || "";
      const link = rss.length ? g("link").trim() : ((it.querySelector("link[rel=alternate]") || it.querySelector("link"))?.getAttribute("href") || "").trim();
      const desc = strip(g("description") || g("summary") || g("content"));
      return { title: strip(g("title")), link, date: Date.parse(g("pubDate") || g("updated") || g("published")) || 0, desc: desc.length > 150 ? desc.slice(0, 147).replace(/\s\S*$/, "") + "…" : desc };
    }).filter(x => x.title && /^https?:/.test(x.link));
    if (!items.length) throw new Error("empty");
    newsCache = { src: learn.news, at: Date.now(), items }; chrome.storage.local.set({ newsCache }); newsState = "ok";
  } catch (_) { newsState = "error"; }
  renderLearn();
}
function newsHtml() {
  const src = TD_NEWS[learn.news], items = newsCache && newsCache.src === learn.news ? newsCache.items.slice(0, 4) : [];
  const head = `<span class="eb"><span class="pill">${esc(CFG.newsLabel || "📰 News today")}</span><select id="newsSel" aria-label="News source">${Object.entries(TD_NEWS).map(([k, v]) => `<option value="${k}" ${learn.news === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
    <button class="topic" type="button" id="newsRefresh" aria-label="Refresh news">↻</button>${newsCache && newsCache.src === learn.news ? `<span class="small">updated ${ago(Date.now() - newsCache.at)}</span>` : ""}</span>`;
  if (!items.length) return head + (newsState === "error"
    ? `<p>Couldn't load the news. Check your connection, or <a href="${esc(src.home)}" target="_blank" rel="noopener">open ${esc(src.label)}</a>.</p>`
    : `<p>Loading the latest news…</p>`);
  return head + `<ol class="news">${items.map((n, k) => `<li><div><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
      <div class="small">${n.date ? ago(Date.now() - n.date) : ""}${n.desc ? " · " + esc(n.desc) : ""}</div></div>
      <button class="x sv" type="button" data-savenews="${k}" title="Save for later" aria-label="Save for later: ${esc(n.title)}">🔖</button></li>`).join("")}</ol>
    ${newsState === "error" ? `<span class="small">Showing the last news we loaded; refreshing failed.</span>` : ""}`;
}
function renderLearn() {
  const { pack, i, item } = todays(), done = learn.lastDone === dayKey(), st = streakNow();
  const sv = [...saved].filter(x => x.type !== "remind").sort((a, b) => a.at - b.at)[0];
  const svDays = sv ? Math.max(0, Math.round((Date.now() - sv.at) / DAY)) : 0;
  $("learn").innerHTML = `
    <div class="lc main">${newsHtml()}</div>
    <div class="lc recall"><span class="eb"><span class="pill">${esc(CFG.learnIcon || "🗣️")} Today's 3-minute ${esc(pack.short || pack.label.split(" ")[0])}</span><span>${st ? `🔥 ${st}-day streak` : "🌱 Start a streak today"}</span></span>
      <div class="topics" role="group" aria-label="Topic">${Object.entries(TD_LANGS).map(([k, v]) => `<button class="topic" type="button" data-lang="${k}" aria-pressed="${learn.lang === k}">${esc(v.label)}</button>`).join("")}</div>
      <h3>${esc(item.title)}</h3>
      <ul class="phr">${item.phrases.slice(0, 2).map(p => `<li><b>${esc(p[0])}</b> <span class="small">${esc(p[1])} · ${esc(p[2])}</span></li>`).join("")}</ul>
      <div class="lrow"><button class="gobtn" type="button" id="learnGo">${done ? "✓ Done today · review" : "Learn now · 3 min"}</button>
        <span class="small">Lesson ${i + 1} of ${pack.items.length}</span></div></div>
    <div class="lc resurf">${sv ? `<span class="eb">🔖 From your saved list · saved ${svDays ? svDays + " day" + (svDays > 1 ? "s" : "") + " ago" : "today"}</span><h3>${esc(sv.name)}</h3>
        <p>${sv.type === "page" ? esc(sv.site || "") : `${sv.tabs.length} tabs saved as a bundle`}. Got 3 minutes? This is a good moment.</p>
        <div class="lrow"><button class="btn" type="button" data-reopen="${sv.id}">Open now</button></div>`
      : `<span class="eb">🔖 From your saved list</span><h3>Nothing saved yet</h3><p>Tap 🔖 on any tab or news story. It comes back here when you have a spare minute.</p>`}</div>`;
}
function speak(text) {
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = TD_LANGS[learn.lang].voice || "en-US"; u.rate = .85; speechSynthesis.speak(u); }
  catch (_) { toast("Read-aloud isn't available in this browser."); }
}
function openLesson() {
  const { pack, i, item } = todays(), done = learn.lastDone === dayKey(), y = todays(-1).item;
  $("lessonRoot").innerHTML = `<div class="ov" id="lessonOv"><div class="reader" role="dialog" aria-modal="true" aria-labelledby="lt">
    <div class="reader-h"><span class="eb">${esc(CFG.learnIcon || "🗣️")} ${esc(pack.label)} · lesson ${i + 1} of ${pack.items.length} · about 3 minutes</span><h2 id="lt">${esc(item.title)}</h2>
      <button class="close" type="button" data-lclose aria-label="Close">✕</button></div>
    <div class="reader-b">
      <div class="tryit"><b>🧠 Warm-up from last time</b>${esc(y.quiz.q)}<div class="ropts" style="margin-top:8px">${y.quiz.opts.map((o, k) => `<button class="ropt" type="button" data-wq="${k}">${esc(o)}</button>`).join("")}</div><div class="rfb" id="wqfb"></div></div>
      <ol class="pts">${item.phrases.map((p, k) => `<li><span>${k + 1}</span><div><b style="font-size:18px">${esc(p[0])}</b> <button class="topic" type="button" data-say="${esc(p[0])}" aria-label="Listen">🔊</button><br><span class="small">${esc(p[1])}</span> · ${esc(p[2])}</div></li>`).join("")}</ol>
      <div class="tryit"><b>Try it today</b>${esc(item.tryit)}</div>
      <div><span class="small">Quick check</span><div style="font-weight:800;margin:4px 0 8px">${esc(item.quiz.q)}</div>
        <div class="ropts">${item.quiz.opts.map((o, k) => `<button class="ropt" style="background:var(--chip)" type="button" data-lq="${k}">${esc(o)}</button>`).join("")}</div><div class="rfb" id="lqfb"></div></div>
      <div class="lrow" style="justify-content:space-between"><span class="small">Next lesson tomorrow, on your first new tab.</span><button class="gobtn" type="button" data-ldone>${done ? "Close" : "Done for today 🎉"}</button></div></div></div></div>`;
  $("lessonRoot").querySelector("[data-lclose]").focus();
}
function markQuiz(sel, q, pick, fbId) {
  document.querySelectorAll(sel).forEach((b, k) => { b.classList.remove("right", "wrong"); b.style.background = k === q.a || k === pick ? "" : "var(--chip)"; if (k === q.a) b.classList.add("right"); else if (k === pick) b.classList.add("wrong"); });
  $(fbId).textContent = pick === q.a ? "Correct!" : "Not quite. The right answer is highlighted.";
}
function finishLesson() {
  const today = dayKey(), y = dayKey(new Date(Date.now() - DAY));
  if (learn.lastDone !== today) { learn.streak = learn.lastDone === y ? learn.streak + 1 : 1; learn.lastDone = today; saveLearn(); TDSound.close(1, true, settings.effect, settings.sound); toast(`Lesson done. 🔥 ${learn.streak}-day streak!`); }
  $("lessonRoot").innerHTML = ""; renderLearn();
}
function saveNews(k) {
  const n = newsCache?.items?.[k]; if (!n) return;
  saved.unshift({ id: Math.random().toString(36).slice(2, 10), type: "page", name: n.title, site: TD_NEWS[newsCache.src].label, tabs: [{ url: n.link, title: n.title }], at: Date.now() });
  saveSaved(); render(); toast("Saved for later. It'll come back in the saved card.");
}

/* ---------- Tab Wrapped (real numbers from this week) ---------- */
let wIdx = 0;
function wSlides() {
  const freed = (week.closed * GB_PER_TAB).toFixed(1);
  const top = Object.entries(week.siteMax).sort((a, b) => b[1] - a[1])[0];
  const oldest = tabs.filter(t => t.born).sort((a, b) => a.born - b.born)[0];
  const handled = week.handled.slice(-6).reverse().map(h => `${h.name} ${h.how === "remind" ? "⏰ reminder" : "📦 bundled"}`);
  const persona = week.closed >= 30 ? ["The Closer", `You closed ${week.closed} tabs this week. Unfinished business doesn't scare you.`]
    : week.closed >= 10 ? ["The Tidier", `${week.closed} tabs closed. Getting there.`]
    : ["The Collector", "You keep tabs like souvenirs. TabDeck is here when you're ready."];
  return [
    { bg: "linear-gradient(160deg,#3B2BD8,#9B3BE0)", html: `<span class="k">Your week in tabs</span><span class="big" data-count="${week.closed}">0</span><span class="h">tabs closed this week.</span>` },
    { bg: "linear-gradient(160deg,#0E8A7E,#2EC4A0)", html: `<span class="k">Memory freed (estimate)</span><span class="big">${freed}<span style="font-size:.4em"> GB</span></span><span class="p">Busiest moment: <b>${week.peak} tabs</b> open${week.peakAt ? ", " + new Date(week.peakAt).toLocaleString([], { weekday: "long", hour: "numeric" }) : ""}.</span>` },
    { bg: "linear-gradient(160deg,#E2553A,#FF9E43)", html: `<span class="k">Loose ends saved for later</span><span class="big">${week.handled.length}</span>${handled.length ? `<ul>${handled.map(h => `<li>${esc(h)}</li>`).join("")}</ul>` : `<span class="p">Try 📦 or ⏰ on a card next time.</span>`}` },
    { bg: "linear-gradient(160deg,#C2185B,#FF5E7E)", html: `<span class="k">Most hoarded website</span>${top ? `<span class="h" style="font-size:34px;overflow-wrap:anywhere">${esc(top[0])}</span><span class="big" style="font-size:72px">${top[1]}</span><span class="p">tabs open at the same time.</span>` : `<span class="p">Not enough data yet.</span>`}` },
    { bg: "linear-gradient(160deg,#263238,#546E7A)", html: `<span class="k">Longest-living tab</span>${oldest ? `<span class="h">“${esc(oldest.title)}”</span><span class="p">open since ${new Date(oldest.born).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}.</span>` : `<span class="p">Not enough data yet.</span>`}` },
    { bg: "linear-gradient(160deg,#1A1626,#3B2BD8)", html: `<span class="k">Your tab personality</span><span class="h" style="font-size:44px">${persona[0]}</span><span class="p">${esc(persona[1])}</span>`, last: true }
  ];
}
function closeWrapped() { $("wrapRoot").innerHTML = ""; }
function renderWrapped() {
  const sl = wSlides(), x = sl[wIdx];
  $("wrapRoot").innerHTML = `<div class="wr" id="wr"><div class="slide" role="dialog" aria-modal="true" style="background:${x.bg}">
    <div class="top">${sl.map((_, i) => `<i class="${i <= wIdx ? "on" : ""}"></i>`).join("")}</div>${x.html}
    <div class="nav">${wIdx ? `<button class="ghost" type="button" data-wprev>Back</button>` : `<button class="ghost" type="button" data-wclose>Close</button>`}
    ${x.last ? `<button type="button" data-wclose>Done</button>` : `<button type="button" data-wnext>Next</button>`}</div></div></div>`;
  const c = $("wrapRoot").querySelector("[data-count]");
  if (c) { const end = +c.dataset.count; if (reduce) c.textContent = end; else { const st = performance.now(); const tick = n => { const p = Math.min(1, (n - st) / 900); c.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); } }
  TDSound.tick(wIdx, settings.sound);
}
function wStep(d) { const n = wSlides().length; wIdx = Math.max(0, Math.min(n - 1, wIdx + d)); renderWrapped(); if (wIdx === n - 1 && d > 0) TDSound.close(1, true, settings.effect, settings.sound); }

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const t = e.target;
  if (t.id === "undoBtn") { $("toast").hidden = true; return undo(); }
  if (t.id === "learnGo") return openLesson();
  if (t.id === "newsRefresh") return loadNews(true);
  const sn = t.closest("[data-savenews]"); if (sn) return saveNews(+sn.dataset.savenews);
  const lg = t.closest("[data-lang]"); if (lg) { learn.lang = lg.dataset.lang; saveLearn(); return renderLearn(); }
  const say = t.closest("[data-say]"); if (say) return speak(say.dataset.say);
  const wq = t.closest("[data-wq]"); if (wq) return markQuiz("[data-wq]", todays(-1).item.quiz, +wq.dataset.wq, "wqfb");
  const lq = t.closest("[data-lq]"); if (lq) return markQuiz("[data-lq]", todays().item.quiz, +lq.dataset.lq, "lqfb");
  if (t.closest("[data-lclose]") || t.id === "lessonOv") { $("lessonRoot").innerHTML = ""; return; }
  if (t.closest("[data-ldone]")) return finishLesson();
  const sv = t.closest("[data-save]"); if (sv) return savePage(+sv.dataset.save);
  const x = t.closest("[data-close]"); if (x) return closeTabs([+x.dataset.close]);
  const go = t.closest("[data-go]"); if (go) { const tab = tabs.find(z => z.id === +go.dataset.go); if (tab) { await chrome.tabs.update(tab.id, { active: true }); chrome.windows.update(tab.windowId, { focused: true }); } return; }
  const dd = t.closest("[data-dups]"); if (dd) { const g = groups().find(z => z.key === dd.dataset.dups); return g && closeTabs(g.items.filter(z => z.dup && z.safe).map(z => z.id), "Closed duplicates:"); }
  const al = t.closest("[data-all]"); if (al) { const g = groups().find(z => z.key === al.dataset.all); return g && closeTabs(g.items.filter(z => z.safe).map(z => z.id)); }
  const bu = t.closest("[data-bundle]"); if (bu) return saveGroup(bu.dataset.bundle, "bundle");
  const ro = t.closest("[data-reopen]"); if (ro) return reopenSaved(ro.dataset.reopen);
  const fg = t.closest("[data-forget]"); if (fg) return forgetSaved(fg.dataset.forget);
  if (t.id === "closeDups") return closeTabs(tabs.filter(z => z.dup && z.safe).map(z => z.id), "Closed duplicates:");
  if (t.id === "closeStale") return closeTabs(tabs.filter(z => z.stale && z.safe && !z.active).map(z => z.id));
  if (t.id === "wrapBtn") { wIdx = 0; return renderWrapped(); }
  if (t.closest("[data-wnext]")) return wStep(1);
  if (t.closest("[data-wprev]")) return wStep(-1);
  if (t.closest("[data-wclose]") || t.id === "wr") return closeWrapped();
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.matches("[data-remind]") && t.value) return saveGroup(t.dataset.remind, "remind", t.value);
  if (t.id === "newsSel") { learn.news = t.value; saveLearn(); return loadNews(false); }
  if (t.id === "fxSel" || t.id === "sndSel") {
    settings = { effect: $("fxSel").value, sound: $("sndSel").value }; chrome.storage.local.set({ settings });
    $("grid").className = "grid fx-" + settings.effect; TDSound.close(1, false, settings.effect, settings.sound);
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("lessonOv")) { $("lessonRoot").innerHTML = ""; return; }
  if (!$("wr")) return;
  if (e.key === "Escape") closeWrapped(); if (e.key === "ArrowRight") wStep(1); if (e.key === "ArrowLeft") wStep(-1);
});
$("search").addEventListener("input", e => { query = e.target.value; render(); });

chrome.tabs.onCreated.addListener(soon);
chrome.tabs.onRemoved.addListener(soon);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.title || info.status === "complete" || info.audible !== undefined || info.pinned !== undefined) soon(); });
chrome.tabs.onActivated.addListener(soon);
chrome.storage.onChanged.addListener(ch => { if (ch.saved) { saved = ch.saved.newValue || []; soon(); } if (ch.born) born = ch.born.newValue || {}; });
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

(async () => {
  const me = await chrome.tabs.getCurrent(); selfId = me ? me.id : null;
  await loadStore();
  if (CFG.greeting) { $("greet").textContent = CFG.greeting; $("greet").hidden = false; }
  $("fxSel").value = settings.effect; $("sndSel").value = settings.sound;
  await refresh();
  loadNews(false);
})();
