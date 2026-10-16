const DEFAULT_FOLDER = "NewTab";
// Keep in sync with the column count in newtab.css.
const TILES_PER_ROW = 8;

const groupsEl = document.getElementById("groups");
const emptyEl = document.getElementById("empty");
const emptyTextEl = document.getElementById("empty-text");
const createBtn = document.getElementById("create");
const filterEl = document.getElementById("filter");
const timeEl = document.getElementById("time");
const dateEl = document.getElementById("date");

let currentFolderId = null;
let allGroups = [];
let activeTile = null;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
let clockTimer = null;

function updateClock() {
  clearTimeout(clockTimer);
  const now = new Date();
  timeEl.textContent = timeFormat.format(now);
  dateEl.textContent = dateFormat.format(now);
  clockTimer = setTimeout(updateClock, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}

async function getFolderName() {
  const { folderName } = await chrome.storage.sync.get({ folderName: DEFAULT_FOLDER });
  return folderName.trim() || DEFAULT_FOLDER;
}

// Bookmark IDs are local to each PC, so the folder is looked up by name.
// If several folders share the name, the one with the most children wins.
async function findFolder(name) {
  const matches = (await chrome.bookmarks.search({ title: name })).filter((n) => !n.url);
  let best = null;
  for (const match of matches) {
    const [tree] = await chrome.bookmarks.getSubTree(match.id);
    if (!best || tree.children.length > best.children.length) best = tree;
  }
  return best;
}

function collectLinks(folder) {
  return folder.children.flatMap((child) => (child.url ? [child] : collectLinks(child)));
}

// Loose bookmarks in the root folder form an untitled first group;
// each subfolder is a group, with nested folders flattened into it.
function buildGroups(root) {
  const groups = [];
  const loose = root.children.filter((c) => c.url);
  if (loose.length) groups.push({ title: "", links: loose });
  for (const child of root.children) {
    if (!child.url) groups.push({ title: child.title, links: collectLinks(child) });
  }
  return groups;
}

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "64");
  return url.toString();
}

function hostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function linkLabel(bookmark) {
  return bookmark.title || hostname(bookmark.url);
}

function renderGroup(group) {
  const section = document.createElement("section");
  section.className = "group";

  if (group.title) {
    const h2 = document.createElement("h2");
    h2.textContent = group.title;
    h2.title = group.title;
    section.append(h2);
  }

  const ul = document.createElement("ul");
  for (const bookmark of group.links) {
    const a = document.createElement("a");
    a.href = bookmark.url;
    a.title = `${linkLabel(bookmark)}\n${bookmark.url}`;

    const img = document.createElement("img");
    img.src = faviconUrl(bookmark.url);
    img.alt = "";

    const span = document.createElement("span");
    span.textContent = linkLabel(bookmark);

    a.append(img, span);
    const li = document.createElement("li");
    li.append(a);
    ul.append(li);
  }

  // Pad every row to TILES_PER_ROW; an empty group still gets one row.
  const slots = Math.max(1, Math.ceil(group.links.length / TILES_PER_ROW)) * TILES_PER_ROW;
  for (let i = group.links.length; i < slots; i++) {
    const li = document.createElement("li");
    li.className = "placeholder";
    li.setAttribute("aria-hidden", "true");
    ul.append(li);
  }
  section.append(ul);
  return section;
}

// Matching the full URL would make short terms like "o" hit everything, so only the domain counts.
function matches(bookmark, terms) {
  const haystack = `${linkLabel(bookmark)} ${hostname(bookmark.url)}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function tiles() {
  return [...groupsEl.querySelectorAll(".group a")];
}

function setActive(tile) {
  activeTile?.classList.remove("active");
  activeTile = tile || null;
  if (activeTile) {
    activeTile.classList.add("active");
    activeTile.scrollIntoView({ block: "nearest" });
  }
}

// Every search term must appear in the name or domain; groups without matches are hidden.
function renderGroups() {
  const query = filterEl.value.trim();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = terms.length
    ? allGroups
        .map((group) => ({ ...group, links: group.links.filter((b) => matches(b, terms)) }))
        .filter((group) => group.links.length)
    : allGroups;

  activeTile = null;
  if (!groups.length) {
    const p = document.createElement("p");
    p.className = "no-matches";
    p.textContent = `No bookmarks match "${query}".`;
    groupsEl.replaceChildren(p);
    return;
  }
  groupsEl.replaceChildren(...groups.map(renderGroup));
  if (terms.length) setActive(tiles()[0]);
}

function showEmpty(text, buttonLabel) {
  groupsEl.replaceChildren();
  filterEl.hidden = true;
  emptyTextEl.textContent = text;
  createBtn.textContent = buttonLabel;
  createBtn.hidden = !buttonLabel;
  emptyEl.hidden = false;
}

async function render() {
  const name = await getFolderName();
  const root = await findFolder(name);
  currentFolderId = root ? root.id : null;

  if (!root) {
    showEmpty(`No bookmarks folder named "${name}" was found.`, `Create "${name}" in Bookmarks bar`);
    return;
  }

  allGroups = buildGroups(root);
  if (!allGroups.length) {
    showEmpty(`The "${name}" folder is empty. Add subfolders (groups) with bookmarks to it.`, "");
    return;
  }

  emptyEl.hidden = true;
  filterEl.hidden = false;
  renderGroups();
}

function openTile(tile, inBackground) {
  if (inBackground) chrome.tabs.create({ url: tile.href, active: false });
  else location.href = tile.href;
}

// The nearest tile in the row above (dir -1) or below (dir 1), by on-screen position.
function tileInDirection(from, dir) {
  const box = from.getBoundingClientRect();
  const centerX = box.left + box.width / 2;
  const candidates = tiles()
    .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
    .filter((c) => (dir > 0 ? c.box.top > box.bottom : c.box.bottom < box.top));
  if (!candidates.length) return null;

  const rowTops = candidates.map((c) => c.box.top);
  const rowTop = dir > 0 ? Math.min(...rowTops) : Math.max(...rowTops);
  const distance = (c) => Math.abs(c.box.left + c.box.width / 2 - centerX);
  return candidates
    .filter((c) => Math.abs(c.box.top - rowTop) < 1)
    .reduce((best, c) => (distance(c) < distance(best) ? c : best)).tile;
}

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 100);
}

createBtn.addEventListener("click", async () => {
  const [tree] = await chrome.bookmarks.getTree();
  const bookmarksBar = tree.children[0];
  await chrome.bookmarks.create({ parentId: bookmarksBar.id, title: await getFolderName() });
});

document.getElementById("edit").addEventListener("click", () => {
  const url = currentFolderId ? `chrome://bookmarks/?id=${currentFolderId}` : "chrome://bookmarks/";
  chrome.tabs.update({ url });
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

filterEl.addEventListener("input", renderGroups);

// In the filter box: Up/Down step through matches, Enter opens the active one
// (Ctrl/Cmd+Enter in a background tab), Escape clears the filter.
filterEl.addEventListener("keydown", (event) => {
  const list = tiles();
  const index = list.indexOf(activeTile);
  switch (event.key) {
    case "ArrowDown":
      setActive(list[Math.min(index + 1, list.length - 1)]);
      break;
    case "ArrowUp":
      setActive(list[Math.max(index - 1, 0)]);
      break;
    case "Enter":
      if (activeTile) openTile(activeTile, event.ctrlKey || event.metaKey);
      break;
    case "Escape":
      filterEl.value = "";
      renderGroups();
      break;
    default:
      return;
  }
  event.preventDefault();
});

// On a focused tile, arrow keys move around the grid; Up from the top row returns to the filter.
groupsEl.addEventListener("keydown", (event) => {
  const tile = event.target.closest(".group a");
  if (!tile) return;
  const list = tiles();
  const index = list.indexOf(tile);
  let next;
  switch (event.key) {
    case "ArrowLeft":
      next = list[index - 1];
      break;
    case "ArrowRight":
      next = list[index + 1];
      break;
    case "ArrowUp":
      next = tileInDirection(tile, -1) ?? filterEl;
      break;
    case "ArrowDown":
      next = tileInDirection(tile, 1);
      break;
    default:
      return;
  }
  event.preventDefault();
  next?.focus();
});

// A focused tile is the active one; focus anywhere else except the filter clears it.
document.addEventListener("focusin", (event) => {
  const tile = event.target.closest?.(".group a");
  if (tile) setActive(tile);
  else if (event.target !== filterEl) setActive(null);
});

// Chrome keeps focus in the address bar on a new tab, so typing on the page
// or clicking its background sends you to the filter.
document.addEventListener("keydown", (event) => {
  if (filterEl.hidden || document.activeElement === filterEl) return;
  if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
    filterEl.focus();
  }
});

document.addEventListener("mousedown", (event) => {
  if (filterEl.hidden || event.target.closest("a, button, input")) return;
  event.preventDefault();
  filterEl.focus();
});

for (const event of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
  chrome.bookmarks[event].addListener(scheduleRender);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.folderName) scheduleRender();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClock();
});

updateClock();
render();
