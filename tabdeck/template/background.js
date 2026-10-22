// TabDeck background: remembers when each tab was opened, and fires reminders.

const now = () => Date.now();

async function getBorn() {
  const { born = {} } = await chrome.storage.local.get("born");
  return born;
}

// On install / browser start, give tabs we haven't seen a "first seen" time.
async function seedBorn() {
  const born = await getBorn();
  const tabs = await chrome.tabs.query({});
  const alive = new Set(tabs.map(t => String(t.id)));
  for (const t of tabs) if (!born[t.id]) born[t.id] = now();
  for (const id of Object.keys(born)) if (!alive.has(id)) delete born[id];
  await chrome.storage.local.set({ born });
}
chrome.runtime.onInstalled.addListener(seedBorn);
chrome.runtime.onStartup.addListener(seedBorn);

chrome.tabs.onCreated.addListener(async tab => {
  const born = await getBorn();
  born[tab.id] = now();
  await chrome.storage.local.set({ born });
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const born = await getBorn();
  delete born[tabId];
  await chrome.storage.local.set({ born });
});

// Reminders: alarm name is "remind:<savedId>"
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith("remind:")) return;
  const id = alarm.name.slice(7);
  const { saved = [] } = await chrome.storage.local.get("saved");
  const item = saved.find(s => s.id === id);
  if (!item) return;
  chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "TabDeck reminder: " + item.name,
    message: (item.note ? item.note + " · " : "") + `Click to reopen ${item.tabs.length} tab${item.tabs.length > 1 ? "s" : ""}.`,
    priority: 2
  });
});

chrome.notifications.onClicked.addListener(async notifId => {
  if (!notifId.startsWith("remind:")) return;
  const id = notifId.slice(7);
  const { saved = [] } = await chrome.storage.local.get("saved");
  const item = saved.find(s => s.id === id);
  if (!item) return;
  for (const t of item.tabs) await chrome.tabs.create({ url: t.url, active: false });
  await chrome.storage.local.set({ saved: saved.filter(s => s.id !== id) });
  chrome.notifications.clear(notifId);
});
