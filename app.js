const AREAS = [
  {
    id: "livestock",
    name: "Animals",
    shortName: "Animal management",
    description: "Register your animals and keep their health, breeding, and care records.",
    tint: "sage",
    icon: '<path d="M4 13.5V9.2a2.2 2.2 0 0 1 2.2-2.2h11.6A2.2 2.2 0 0 1 20 9.2v4.3M5 13.5h14l1 5.5h-3l-1-3H8l-1 3H4l1-5.5Zm2-6.5L6 4m11 3 1-3M9 11h.01M15 11h.01"/>'
  },
  {
    id: "finance",
    name: "Accounting",
    shortName: "Accounting",
    description: "Record farm income and expenses, and see how the numbers add up.",
    tint: "butter",
    icon: '<path d="M12 3v18m4-13.5c-.8-1-2.1-1.5-4-1.5-2.2 0-4 1.1-4 3s1.5 2.6 4 3 4 1 4 3-1.8 3-4 3c-1.9 0-3.3-.6-4.2-1.7M4 7h2m12 10h2"/>'
  },
  {
    id: "production",
    name: "Production & resources",
    shortName: "Production & resources",
    description: "Track farm output, resource use, available stock, and produce sales.",
    tint: "sage",
    icon: '<path d="M4 19h16M6 16l4-5 3 3 5-7m-1 0h3v3"/>'
  },
  {
    id: "tasks",
    name: "Tasks & reminders",
    shortName: "Tasks & reminders",
    description: "Plan the work ahead, from vaccinations to daily routines.",
    tint: "peach",
    icon: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 4 2 2 4-4"/>'
  },
  {
    id: "crops",
    name: "Crops & fields",
    shortName: "Crop management",
    description: "Track fields, planting dates, growing crops, and expected harvests.",
    tint: "blue",
    icon: '<path d="M12 21V11m0 5c-6 0-9-3-9-9 6 0 9 3 9 9Zm0-4c0-6 3-9 9-9 0 6-3 9-9 9Z"/>'
  },
  {
    id: "employees",
    name: "Employee management",
    shortName: "Employees",
    description: "Keep your staff details, work logs, and payments organized.",
    tint: "peach",
    icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-3a4 4 0 0 1 0 8m2 1a4 4 0 0 1 2 3v1"/>'
  }
];

const TRANSACTION_CATEGORIES = {
  income: ["Produce sales", "Livestock sales", "Other income"],
  expense: ["Crop inputs", "Feed and supplies", "Animal care", "Labor", "Fuel", "Equipment and repairs", "Utilities", "Other expense"]
};

const DEFAULT_CATALOG = {
  animals: ["Cattle", "Goat", "Sheep", "Pig", "Chickens", "Ducks", "Turkeys", "Horses", "Honey bees", "Rabbits", "Other"],
  crops: ["Wheat", "Maize (corn)", "Rice", "Barley", "Oats", "Soybeans", "Potatoes", "Cassava", "Beans", "Sorghum", "Cotton", "Vegetables", "Fruit"]
};

const DATA_SCHEMA_VERSION = 3;
const BACKUP_FORMAT = "fieldnote-farm-backup";
const PRODUCTION_MOVEMENTS = ["Production", "Consumption", "Stock received", "Sale"];
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let data;
let currentView = "dashboard";
let draftPriorities = [];
let farmNameDraft = "";
let draftCatalog;
let toastTimer;
let storageBackend = "indexeddb";
let recoveryPayload = "";
let deferredInstallPrompt = null;
let storageRetentionNote = "Browser storage can be cleared when site data is removed; keep a separate backup.";

function copyCatalog(catalog = DEFAULT_CATALOG) {
  return { animals: [...catalog.animals], crops: [...catalog.crops] };
}

function normalizeCatalogList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, 60))
    .filter(Boolean))];
}

function normalizeCatalog(value) {
  return {
    animals: normalizeCatalogList(value?.animals, DEFAULT_CATALOG.animals),
    crops: normalizeCatalogList(value?.crops, DEFAULT_CATALOG.crops)
  };
}

function emptyEntries() {
  return Object.fromEntries(AREAS.map((area) => [area.id, []]));
}

function normalizeData(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The saved farm data is not a valid object.");
  }
  if (Number(parsed.schemaVersion || 1) > DATA_SCHEMA_VERSION) {
    throw new Error("This data was saved by a newer Fieldnote version. Update the app before opening it.");
  }
  if (parsed.entries !== undefined && (!parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries))) {
    throw new Error("The saved farm record collection is invalid.");
  }
  const validPriorities = Array.isArray(parsed.priorities)
    ? parsed.priorities.filter((id, index, items) =>
        AREAS.some((area) => area.id === id) && items.indexOf(id) === index
      )
    : [];
  if (Number(parsed.schemaVersion || 1) < DATA_SCHEMA_VERSION && validPriorities.length && !validPriorities.includes("production")) {
    validPriorities.push("production");
  }
  const entries = emptyEntries();
  const entryIds = new Set();
  for (const area of AREAS) {
    if (parsed.entries?.[area.id] !== undefined && !Array.isArray(parsed.entries[area.id])) {
      throw new Error(`Saved ${area.name.toLowerCase()} records are invalid.`);
    }
    if (!Array.isArray(parsed.entries?.[area.id])) continue;
    for (const entry of parsed.entries[area.id]) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || typeof entry.title !== "string") {
        throw new Error(`A saved ${area.name.toLowerCase()} record is incomplete. Restore from a backup or recover the original data.`);
      }
      if (entryIds.has(entry.id)) throw new Error("Saved records contain duplicate IDs and need recovery before they can be safely used.");
      entryIds.add(entry.id);
      entries[area.id].push(entry);
    }
  }
  return {
    ...parsed,
    schemaVersion: DATA_SCHEMA_VERSION,
    farmName: typeof parsed.farmName === "string" ? parsed.farmName : "",
    priorities: validPriorities,
    catalog: normalizeCatalog(parsed.catalog),
    entries
  };
}

async function loadData() {
  try {
    const stored = await window.FieldnoteStorage.read();
    storageBackend = stored.backend;
    const saved = stored.payload;
    if (!saved) return null;
    recoveryPayload = saved;
    const parsed = JSON.parse(saved);
    const normalized = normalizeData(parsed);
    if (Number(parsed.schemaVersion || 1) !== DATA_SCHEMA_VERSION) {
      storageBackend = await window.FieldnoteStorage.write(JSON.stringify(normalized));
      recoveryPayload = JSON.stringify(normalized);
    }
    return normalized;
  } catch (error) {
    console.error("Could not load saved farm data.", error);
    throw error;
  }
}

async function saveData() {
  try {
    data.schemaVersion = DATA_SCHEMA_VERSION;
    storageBackend = await window.FieldnoteStorage.write(JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Could not save farm data.", error);
    showToast("Could not safely save your changes. Keep the app open and export a backup before retrying.");
    return false;
  }
}

async function updateCatalog(update) {
  const previousDraft = copyCatalog(draftCatalog);
  const previousSaved = copyCatalog(data.catalog);
  update(draftCatalog);
  data.catalog = copyCatalog(draftCatalog);
  if (await saveData()) return true;
  draftCatalog = previousDraft;
  data.catalog = previousSaved;
  return false;
}

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatStorageSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["bytes", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function downloadBackup(payload, filename) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeBackup() {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: DATA_SCHEMA_VERSION,
    data
  }, null, 2);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function areaFor(id) {
  return AREAS.find((area) => area.id === id);
}

function icon(area, className = "") {
  return `<span class="area-icon ${className} ${area.tint}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${area.icon}</svg></span>`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function formatAmount(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function entriesOf(area, type) {
  return data.entries[area].filter((entry) => entry.type === type);
}

function areaRecordCount(id) {
  if (id === "livestock") return entriesOf(id, "animal").length;
  if (id === "finance") return entriesOf(id, "transaction").length;
  if (id === "crops") return entriesOf(id, "crop").length;
  if (id === "employees") return entriesOf(id, "employee").length;
  if (id === "production") return entriesOf(id, "production-activity").length;
  return data.entries[id].length;
}

function recordHeading(entry) {
  return entry.title || entry.employeeName || entry.animalName || entry.cropName || "Farm record";
}

function currentAnimalWeight(animal) {
  const latestActivity = entriesOf("livestock", "animal-activity")
    .filter((activity) => activity.animalId === animal.id && Number(activity.weight) > 0)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0))[0];
  return latestActivity
    ? { weight: String(latestActivity.weight), weightUnit: latestActivity.weightUnit || "kg" }
    : { weight: animal.initialWeight || "", weightUnit: animal.initialWeightUnit || "" };
}

function productionStock() {
  const balances = new Map();
  for (const entry of entriesOf("production", "production-activity")) {
    const itemName = String(entry.itemName || "").trim();
    const unit = String(entry.unit || "").trim();
    const quantity = Number(entry.quantity);
    if (!itemName || !unit || !Number.isFinite(quantity) || quantity <= 0) continue;
    const key = `${itemName.toLocaleLowerCase()}\u0000${unit.toLocaleLowerCase()}`;
    const item = balances.get(key) || { itemName, unit, quantity: 0 };
    if (entry.movementType === "Production" || entry.movementType === "Stock received") item.quantity += quantity;
    else if (entry.movementType === "Consumption" || entry.movementType === "Sale") item.quantity -= quantity;
    balances.set(key, item);
  }
  return [...balances.values()]
    .map((item) => ({ ...item, quantity: Math.round(item.quantity * 1000) / 1000 }))
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.unit.localeCompare(b.unit));
}

function productionSourceLabel(entry) {
  if (!entry.sourceArea || !entry.sourceId) return "General resource";
  const records = ["livestock", "crops"].includes(entry.sourceArea) ? data.entries[entry.sourceArea] : [];
  const source = records.find((item) => item.id === entry.sourceId);
  if (!source) return entry.sourceName || "Former or archived record";
  return entry.sourceArea === "livestock"
    ? `${source.animalName || source.title} · ${source.species || "Animal"}`
    : `${source.cropName || source.title} · ${source.fieldName || "Crop"}`;
}

function render() {
  if (!data) {
    renderSetup();
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#" data-action="dashboard" aria-label="Fieldnote home">
          <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11m0 5c-6 0-9-3-9-9 6 0 9 3 9 9Zm0-4c0-6 3-9 9-9 0 6-3 9-9 9Z"/></svg></span>
          <span>fieldnote<span class="brand-period">.</span></span>
        </a>
        <div class="farm-switcher"><span class="farm-avatar">${escapeHtml((data.farmName || "F").slice(0, 1).toUpperCase())}</span><span class="farm-label">${escapeHtml(data.farmName || "My farm")}<small>Farm workspace</small></span><span class="switcher-dot" aria-hidden="true"></span></div>
        <p class="nav-label">YOUR FARM</p>
        <nav class="main-nav" aria-label="Main navigation">
          <button class="nav-item ${currentView === "dashboard" ? "active" : ""}" data-action="dashboard"><span class="nav-symbol">⌂</span> Overview</button>
          ${data.priorities.map((id) => {
            const area = areaFor(id);
            return `<button class="nav-item ${currentView === id ? "active" : ""}" data-action="open-area" data-area="${id}">${icon(area, "nav-area-icon")} ${escapeHtml(area.shortName)}</button>`;
          }).join("")}
          <button class="nav-item nav-priorities-mobile" data-action="priorities"><span class="nav-symbol">⚙</span> Priorities</button>
        </nav>
        <div class="sidebar-bottom">
          <div class="offline-card"><span class="offline-dot"></span><div><strong>Ready for the field</strong><small>Your data stays on this device.</small></div></div>
          <button class="nav-item ${currentView === "priorities" ? "active" : ""}" data-action="priorities"><span class="nav-symbol">⚙</span> Your priorities</button>
          <div class="sidebar-foot">A little more organized,<br>one day at a time.</div>
        </div>
      </aside>
      <main class="main-content">
        <header class="topbar">
          <div class="breadcrumbs"><span>My farm</span><span class="crumb-slash">/</span><strong>${currentView === "dashboard" ? "Overview" : currentView === "priorities" ? "Your priorities" : escapeHtml(areaFor(currentView)?.shortName || "Overview")}</strong></div>
          <div class="topbar-actions"><span class="saved-indicator"><span></span> Saved on this device</span><button class="button button-soft install-app-button" data-action="install-app" hidden>Install app</button><button class="profile-button" data-action="priorities" aria-label="Open your priorities">${escapeHtml((data.farmName || "F").slice(0, 1).toUpperCase())}</button></div>
        </header>
        <section class="page-content">${pageContent()}</section>
      </main>
    </div>
    ${renderModal()}
  `;
  updateInstallButtons();
}

function renderSetup() {
  const selected = draftPriorities;
  app.innerHTML = `
    <main class="setup-page">
      <div class="setup-top"><a class="brand" href="#" aria-label="Fieldnote"><span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11m0 5c-6 0-9-3-9-9 6 0 9 3 9 9Zm0-4c0-6 3-9 9-9 0 6-3 9-9 9Z"/></svg></span><span>fieldnote<span class="brand-period">.</span></span></a><div class="setup-top-actions"><span class="setup-note"><span class="offline-dot"></span> Works offline, right from the start</span><button class="button button-soft install-app-button" data-action="install-app" hidden>Install app</button></div></div>
      <div class="setup-layout">
        <section class="setup-copy">
          <div class="eyebrow"><span class="eyebrow-line"></span> MADE FOR YOUR FARM</div>
          <h1>Your farm.<br><span>Your way.</span></h1>
          <p class="setup-description">Every farm runs a little differently. Choose what you want to keep track of, and put what matters most at the top.</p>
          <div class="setup-note-card"><span class="note-sun">✳</span><p><strong>Start small. Grow as you go.</strong><br>You can change your choices whenever your needs change.</p></div>
          <div class="setup-illustration" aria-hidden="true"><span class="sun"></span><span class="hill hill-back"></span><span class="hill hill-front"></span><span class="plant plant-one">♧</span><span class="plant plant-two">♧</span><span class="barn">⌂</span></div>
        </section>
        <section class="setup-panel">
          <div class="step-label"><span>01</span> &nbsp; YOUR FARM, YOUR FOCUS</div>
          <h2>What would you like to manage?</h2>
          <p class="panel-intro">Choose one or more areas. Use the arrows to put them in the order you care about.</p>
          <form id="setup-form">
            <label class="farm-name-label" for="farm-name">What do you call your farm? <span>OPTIONAL</span></label>
            <input class="farm-name-input" id="farm-name" name="farmName" maxlength="50" placeholder="e.g. Green Acres" autocomplete="organization" value="${escapeHtml(farmNameDraft)}">
            <div class="area-choices">
              ${AREAS.map((area) => choiceCard(area, selected)).join("")}
            </div>
            <div class="selection-footer"><span id="selection-count">${selected.length} selected</span><span>Choose at least one to continue</span></div>
            <button class="button button-primary button-wide" type="submit" ${selected.length === 0 ? "disabled" : ""}>Set up my farm <span aria-hidden="true">→</span></button>
          </form>
          <p class="privacy-note"><span aria-hidden="true">◈</span> Your choices and records are saved privately on this device.</p>
        </section>
      </div>
    </main>
  `;
  updateInstallButtons();
}

function choiceCard(area, selected) {
  const isSelected = selected.includes(area.id);
  const position = selected.indexOf(area.id);
  return `
    <div class="choice-card ${isSelected ? "selected" : ""}">
      <label class="choice-main">
        <input type="checkbox" name="area" value="${area.id}" ${isSelected ? "checked" : ""}>
        ${icon(area)}
        <span class="choice-text"><strong>${escapeHtml(area.name)}</strong><small>${escapeHtml(area.description)}</small></span>
      </label>
      ${isSelected ? `<span class="priority-badge">#${position + 1}</span><span class="order-controls"><button type="button" data-action="move-priority" data-area="${area.id}" data-direction="-1" aria-label="Move ${escapeHtml(area.name)} up" ${position === 0 ? "disabled" : ""}>↑</button><button type="button" data-action="move-priority" data-area="${area.id}" data-direction="1" aria-label="Move ${escapeHtml(area.name)} down" ${position === selected.length - 1 ? "disabled" : ""}>↓</button></span>` : '<span class="add-indicator" aria-hidden="true">+</span>'}
    </div>`;
}

function pageContent() {
  if (currentView === "priorities") return prioritiesPage();
  if (currentView !== "dashboard") return areaPage(currentView);
  return dashboardPage();
}

function dashboardPage() {
  const firstArea = areaFor(data.priorities[0]);
  const totalRecords = Object.values(data.entries).reduce((sum, records) => sum + records.length, 0);
  return `
    <div class="welcome-row"><div><p class="eyebrow"><span class="eyebrow-line"></span> YOUR FARM AT A GLANCE</p><h1>Good day${data.farmName ? `, ${escapeHtml(data.farmName)}` : ""}<span class="greeting-period">.</span></h1><p class="welcome-subtitle">A clear view of what matters on your farm.</p></div><button class="button button-soft" data-action="priorities"><span class="button-icon">＋</span> Customize your farm</button></div>
    <div class="summary-strip"><div class="summary-icon">✳</div><div><strong>Your farm, organized your way</strong><span>${data.priorities.length} ${data.priorities.length === 1 ? "area" : "areas"} in your workspace${firstArea ? ` · <b>${escapeHtml(firstArea.shortName)}</b> is your top priority` : ""}</span></div><button class="text-button" data-action="priorities">Change priorities <span aria-hidden="true">→</span></button></div>
    <div class="section-heading"><div><p class="eyebrow">YOUR FOCUS</p><h2>Here’s what you’re managing</h2></div><span class="section-count">${data.priorities.length} AREAS</span></div>
    <div class="area-grid">
      ${data.priorities.map((id, index) => {
        const area = areaFor(id);
        const count = areaRecordCount(id);
        return `<article class="area-card ${area.tint}-card"><div class="card-top">${icon(area)}<span class="rank-label">${index === 0 ? "TOP PRIORITY" : `PRIORITY ${index + 1}`}</span><button class="more-button" data-action="open-area" data-area="${id}" aria-label="Open ${escapeHtml(area.name)}">↗</button></div><h3>${escapeHtml(area.name)}</h3><p>${escapeHtml(area.description)}</p><div class="card-bottom"><span class="record-count"><strong>${count}</strong> ${count === 1 ? "record" : "records"}</span><button class="card-link" data-action="open-area" data-area="${id}">Open area <span aria-hidden="true">→</span></button></div></article>`;
      }).join("")}
    </div>
    <section class="recent-section"><div class="section-heading recent-heading"><div><p class="eyebrow">A LITTLE PROGRESS</p><h2>Recent notes</h2></div><span class="record-total">${totalRecords} ${totalRecords === 1 ? "entry" : "entries"} so far</span></div>
      ${recentEntries()}
    </section>
    <footer class="page-footer"><span>GROW AT YOUR OWN PACE</span><span>Saved locally · Available offline</span></footer>`;
}

function recentEntries() {
  const records = data.priorities.flatMap((id) =>
    data.entries[id].map((entry) => ({ ...entry, area: areaFor(id) }))
  ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4);
  if (!records.length) {
    return `<div class="empty-state"><span class="empty-sparkle">✳</span><div><strong>Your notes will show up here</strong><p>Add your first record in any area whenever you’re ready.</p></div><button class="text-button" data-action="open-area" data-area="${data.priorities[0]}">Add a note <span aria-hidden="true">→</span></button></div>`;
  }
  return `<div class="recent-list">${records.map((entry) => `<div class="recent-item">${icon(entry.area, "recent-icon")}<div class="recent-details"><strong>${escapeHtml(recordHeading(entry))}</strong><span>${escapeHtml(entry.area.shortName)}${entry.detail ? ` · ${escapeHtml(entry.detail)}` : ""}</span></div><time>${escapeHtml(formatDate(entry.date))}</time></div>`).join("")}</div>`;
}

function areaPage(id) {
  const area = areaFor(id);
  if (!area || !data.priorities.includes(id)) return dashboardPage();
  if (id === "finance") return accountingPage(area);
  if (id === "livestock") return animalManagementPage(area);
  if (id === "crops") return cropManagementPage(area);
  if (id === "employees") return employeeManagementPage(area);
  if (id === "production") return productionManagementPage(area);

  const records = [...data.entries[id]].sort((a, b) => b.createdAt - a.createdAt);
  return `
    <div class="welcome-row area-welcome">${icon(area, "large-area-icon")}<div class="area-welcome-copy"><p class="eyebrow">YOUR FARM / ${escapeHtml(area.shortName.toUpperCase())}</p><h1>${escapeHtml(area.name)}</h1><p class="welcome-subtitle">Plan the work ahead and keep useful farm reminders close at hand.</p></div><button class="button button-primary" data-action="new-record" data-area="${id}"><span class="button-icon">＋</span> Add a record</button></div>
    <div class="log-toolbar"><div><strong>Your notes</strong><span>${records.length} ${records.length === 1 ? "record" : "records"} saved on this device</span></div><span class="local-tag"><span class="offline-dot"></span> Available offline</span></div>
    ${records.length ? `<div class="record-list">${records.map((entry) => `<article class="record-card"><div class="record-date">${escapeHtml(formatDate(entry.date))}</div><div class="record-body"><h3>${escapeHtml(recordHeading(entry))}</h3>${entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}${entry.amount ? `<span class="amount-tag">${escapeHtml(entry.amount)}</span>` : ""}</div><button class="delete-record" data-action="delete-record" data-area="${id}" data-record="${escapeHtml(entry.id)}" aria-label="Delete ${escapeHtml(recordHeading(entry))}">×</button></article>`).join("")}</div>` : `<div class="area-empty"><div class="empty-illustration">${icon(area)}</div><h2>Nothing written down yet</h2><p>Keep a useful note here, so it’s easy to find next time.</p><button class="button button-soft" data-action="new-record" data-area="${id}">＋ &nbsp; Add your first record</button></div>`}
    <div class="page-footer"><span>YOUR DATA BELONGS TO YOU</span><span>Private to this device · Works offline</span></div>`;
}

function managementHeader(area, description, action, buttonLabel) {
  return `<div class="welcome-row area-welcome">${icon(area, "large-area-icon")}<div class="area-welcome-copy"><p class="eyebrow">YOUR FARM / ${escapeHtml(area.shortName.toUpperCase())}</p><h1>${escapeHtml(area.name)}</h1><p class="welcome-subtitle">${escapeHtml(description)}</p></div><button class="button button-primary" data-action="${action}" data-area="${area.id}"><span class="button-icon">＋</span> ${escapeHtml(buttonLabel)}</button></div>`;
}

function animalManagementPage(area) {
  const animals = entriesOf("livestock", "animal").sort((a, b) => a.animalName.localeCompare(b.animalName));
  const activeAnimals = animals.filter((animal) => animal.status === "Active");
  const activities = entriesOf("livestock", "animal-activity")
    .sort((a, b) => b.date.localeCompare(a.date));
  const notes = data.entries.livestock.filter((entry) => !entry.type);
  const statusOptions = ["Active", "Sold", "Deceased", "Archived"];
  return `
    ${managementHeader(area, "Keep an animal register and record health, breeding, weight, and care.", "new-animal", "Add animal")}
    <div class="management-stats"><div><strong>${animals.length}</strong><span>ANIMALS REGISTERED</span></div><div><strong>${animals.filter((animal) => animal.status === "Active").length}</strong><span>ACTIVE ON FARM</span></div><div><strong>${activities.length}</strong><span>CARE & HEALTH LOGS</span></div></div>
    <div class="section-heading management-section-heading"><div><p class="eyebrow">YOUR HERD & FLOCK</p><h2>Animal register</h2></div><span class="local-tag"><span class="offline-dot"></span> Saved on this device</span></div>
    ${animals.length
      ? `<div class="animal-grid">${animals.map((animal) => `<article class="animal-card"><div class="animal-card-top">${icon(area)}<span class="status-pill ${animal.status === "Active" ? "status-active" : "status-muted"}">${escapeHtml(animal.status || "Active")}</span></div><h3>${escapeHtml(animal.animalName)}</h3><p class="animal-id">${animal.tag ? `Tag ${escapeHtml(animal.tag)}` : "No tag recorded"}</p><div class="animal-facts"><span>${escapeHtml(animal.species || "Species not set")}${animal.breed ? ` · ${escapeHtml(animal.breed)}` : ""}</span><span>${animal.sex ? `Sex: ${escapeHtml(animal.sex)}` : "Sex not recorded"}${animal.birthDate ? ` · Born ${escapeHtml(formatDate(animal.birthDate))}` : ""}</span>${animal.weight ? `<span>Last weight: ${escapeHtml(animal.weight)} ${escapeHtml(animal.weightUnit || "kg")}</span>` : ""}</div><label class="status-control">Animal status<select data-field="animal-status" data-animal="${escapeHtml(animal.id)}" aria-label="Update ${escapeHtml(animal.animalName)} status">${statusOptions.map((status) => `<option value="${status}" ${animal.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></article>`).join("")}</div>`
      : `<div class="area-empty management-empty"><div class="empty-illustration">${icon(area)}</div><h2>Start your animal register</h2><p>Add animals with an ID, species, and the details you want to keep on hand.</p><button class="button button-soft" data-action="new-animal" data-area="livestock">＋ &nbsp; Add your first animal</button></div>`}
    <div class="section-heading management-section-heading activity-heading"><div><p class="eyebrow">HEALTH, BREEDING & CARE</p><h2>Animal activity log</h2></div><button class="button button-soft" data-action="new-animal-activity" data-area="livestock" ${activeAnimals.length ? "" : "disabled"}>＋ &nbsp; Log an activity</button></div>
    ${activities.length ? `<div class="management-list">${activities.map((activity) => { const animal = animals.find((item) => item.id === activity.animalId); return `<article class="management-list-item"><div class="record-date">${escapeHtml(formatDate(activity.date))}</div><span class="activity-type">${escapeHtml(activity.activityType || "Care")}</span><div class="record-body"><h3>${escapeHtml(recordHeading(activity))}</h3><p>${escapeHtml(animal ? animal.animalName : "Former or archived animal")}${animal?.tag ? ` · ${escapeHtml(animal.tag)}` : ""}${activity.weight ? ` · Weight ${escapeHtml(activity.weight)} ${escapeHtml(activity.weightUnit || "kg")}` : ""}${activity.detail ? ` · ${escapeHtml(activity.detail)}` : ""}</p></div><button class="delete-record" data-action="delete-record" data-area="livestock" data-record="${escapeHtml(activity.id)}" aria-label="Delete ${escapeHtml(recordHeading(activity))}">×</button></article>`; }).join("")}</div>` : `<p class="management-hint">Vaccinations, treatments, breeding dates, and weight checks can be logged against an animal.</p>`}
    ${renderFarmNotes("livestock", notes, "Previous livestock notes")}
    <div class="page-footer"><span>YOUR DATA BELONGS TO YOU</span><span>Animal records saved locally · Works offline</span></div>`;
}

function accountingPage(area) {
  const transactions = entriesOf("finance", "transaction").sort((a, b) => b.date.localeCompare(a.date));
  const income = transactions.reduce((total, transaction) => total + (transaction.transactionType === "income" ? transaction.amount : 0), 0);
  const expenses = transactions.reduce((total, transaction) => total + (transaction.transactionType === "expense" ? transaction.amount : 0), 0);
  const notes = data.entries.finance.filter((entry) => !entry.type);
  return `
    ${managementHeader(area, "Keep an income-and-expense cashbook for your farm.", "new-transaction", "Add transaction")}
    <div class="management-stats accounting-stats"><div><strong>${formatAmount(income)}</strong><span>INCOME TO DATE</span></div><div><strong>${formatAmount(expenses)}</strong><span>EXPENSES TO DATE</span></div><div><strong>${formatAmount(income - expenses)}</strong><span>NET CASH FLOW</span></div></div>
    <div class="book-currency-note">Amounts are shown in your farm’s currency, without a currency symbol.</div>
    <div class="section-heading management-section-heading"><div><p class="eyebrow">MONEY IN & OUT</p><h2>Transaction ledger</h2></div><span class="section-count">${transactions.length} ENTRIES</span></div>
    ${transactions.length
      ? `<div class="ledger-wrap"><table class="ledger-table"><thead><tr><th scope="col">DATE</th><th scope="col">DESCRIPTION</th><th scope="col">CATEGORY</th><th scope="col" class="number-cell">INCOME</th><th scope="col" class="number-cell">EXPENSE</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${transactions.map((transaction) => `<tr><td>${escapeHtml(formatDate(transaction.date))}</td><td><strong>${escapeHtml(recordHeading(transaction))}</strong></td><td>${escapeHtml(transaction.category || "Other")}</td><td class="number-cell money-in">${transaction.transactionType === "income" ? formatAmount(transaction.amount) : "—"}</td><td class="number-cell money-out">${transaction.transactionType === "expense" ? formatAmount(transaction.amount) : "—"}</td><td><button class="delete-record" data-action="delete-record" data-area="finance" data-record="${escapeHtml(transaction.id)}" aria-label="Delete ${escapeHtml(recordHeading(transaction))}">×</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="area-empty management-empty"><div class="empty-illustration">${icon(area)}</div><h2>Your cashbook starts here</h2><p>Record sales as income and farm purchases or costs as expenses.</p><button class="button button-soft" data-action="new-transaction" data-area="finance">＋ &nbsp; Add your first transaction</button></div>`}
    ${renderFarmNotes("finance", notes, "Previous finance notes")}
    <div class="cashbook-disclaimer">This is a single-entry cashbook, not a full double-entry accounting or tax system. Keep your original receipts and records.</div>
    <div class="page-footer"><span>YOUR DATA BELONGS TO YOU</span><span>Accounting records saved locally · Works offline</span></div>`;
}

function cropManagementPage(area) {
  const crops = entriesOf("crops", "crop").sort((a, b) => (b.plantingDate || "").localeCompare(a.plantingDate || ""));
  const notes = data.entries.crops.filter((entry) => !entry.type);
  const statusOptions = ["Planned", "Planted", "Growing", "Harvested", "Failed"];
  return `
    ${managementHeader(area, "Keep crop cycles and field plans, from planting through harvest.", "new-crop-cycle", "Add crop cycle")}
    <div class="management-stats"><div><strong>${crops.length}</strong><span>CROP CYCLES</span></div><div><strong>${crops.filter((crop) => crop.status === "Growing" || crop.status === "Planted").length}</strong><span>IN THE GROUND</span></div><div><strong>${crops.filter((crop) => crop.status === "Planned").length}</strong><span>PLANNED</span></div></div>
    <div class="section-heading management-section-heading"><div><p class="eyebrow">FIELDS & GROWING SEASONS</p><h2>Crop register</h2></div><span class="local-tag"><span class="offline-dot"></span> Saved on this device</span></div>
    ${crops.length
      ? `<div class="crop-grid">${crops.map((crop) => `<article class="crop-card"><div class="crop-card-top"><span class="crop-status-icon" aria-hidden="true">✳</span><span class="status-pill ${crop.status === "Growing" || crop.status === "Planted" ? "status-active" : "status-muted"}">${escapeHtml(crop.status || "Planned")}</span><button class="delete-record" data-action="delete-record" data-area="crops" data-record="${escapeHtml(crop.id)}" aria-label="Delete ${escapeHtml(recordHeading(crop))}">×</button></div><h3>${escapeHtml(crop.cropName)}</h3><p class="crop-field">${escapeHtml(crop.fieldName)}</p><div class="crop-facts">${crop.fieldSize ? `<span>Field size <strong>${escapeHtml(crop.fieldSize)} ${escapeHtml(crop.fieldUnit || "ha")}</strong></span>` : ""}${crop.plantingDate ? `<span>Planted <strong>${escapeHtml(formatDate(crop.plantingDate))}</strong></span>` : ""}${crop.expectedHarvestDate ? `<span>Expected harvest <strong>${escapeHtml(formatDate(crop.expectedHarvestDate))}</strong></span>` : ""}</div>${crop.detail ? `<p class="crop-notes">${escapeHtml(crop.detail)}</p>` : ""}<label class="status-control">Crop cycle status<select data-field="crop-status" data-crop="${escapeHtml(crop.id)}" aria-label="Update ${escapeHtml(recordHeading(crop))} status">${statusOptions.map((status) => `<option value="${status}" ${crop.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></article>`).join("")}</div>`
      : `<div class="area-empty management-empty"><div class="empty-illustration">${icon(area)}</div><h2>Start your crop register</h2><p>Add a crop and field, then track it from planting to harvest.</p><button class="button button-soft" data-action="new-crop-cycle" data-area="crops">＋ &nbsp; Add your first crop</button></div>`}
    ${renderFarmNotes("crops", notes, "Previous field notes")}
    <div class="page-footer"><span>GROW AT YOUR OWN PACE</span><span>Crop records saved locally · Works offline</span></div>`;
}

function productionManagementPage(area) {
  const activities = entriesOf("production", "production-activity")
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  const stock = productionStock();
  const produced = activities.filter((entry) => entry.movementType === "Production").length;
  const consumed = activities.filter((entry) => entry.movementType === "Consumption").length;
  const sales = activities
    .filter((entry) => entry.movementType === "Sale")
    .reduce((total, entry) => total + (Number(entry.amount) || 0), 0);
  const sourceName = (entry) => entry.sourceArea && entry.sourceId ? productionSourceLabel(entry) : "General stock";
  return `
    ${managementHeader(area, "Record what your animals and crops produce, what the farm uses, and what is available to sell or use.", "new-production-activity", "Log production or use")}
    <div class="management-stats"><div><strong>${produced}</strong><span>PRODUCTION LOGS</span></div><div><strong>${consumed}</strong><span>CONSUMPTION LOGS</span></div><div><strong>${formatAmount(sales)}</strong><span>PRODUCE SALES</span></div></div>
    <p class="book-currency-note">Stock balances group the same item and unit. Sales are added to the accounting ledger automatically; record purchases there separately.</p>
    <div class="section-heading management-section-heading"><div><p class="eyebrow">WHAT IS AVAILABLE NOW</p><h2>Farm stock</h2></div><span class="section-count">${stock.length} ${stock.length === 1 ? "ITEM" : "ITEMS"}</span></div>
    ${stock.length
      ? `<div class="ledger-wrap"><table class="ledger-table stock-table"><thead><tr><th scope="col">PRODUCT OR RESOURCE</th><th scope="col" class="number-cell">AVAILABLE</th><th scope="col">UNIT</th></tr></thead><tbody>${stock.map((item) => `<tr><td><strong>${escapeHtml(item.itemName)}</strong></td><td class="number-cell">${formatAmount(item.quantity)}</td><td>${escapeHtml(item.unit)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="management-hint">No stock recorded yet. Log production or received stock to start tracking what is available.</p>`}
    <div class="section-heading management-section-heading activity-heading"><div><p class="eyebrow">OUTPUT, USE & SALES</p><h2>Production and resource log</h2></div><button class="button button-soft" data-action="new-production-activity" data-area="production">＋ &nbsp; Add log entry</button></div>
    ${activities.length
      ? `<div class="management-list">${activities.map((entry) => `<article class="management-list-item"><div class="record-date">${escapeHtml(formatDate(entry.date))}</div><span class="activity-type">${escapeHtml(entry.movementType)}</span><div class="record-body"><h3>${escapeHtml(entry.itemName)} · ${formatAmount(entry.quantity)} ${escapeHtml(entry.unit)}</h3><p>${escapeHtml(sourceName(entry))}${entry.movementType === "Sale" ? ` · Sale ${formatAmount(entry.amount)}${entry.financeTransactionId ? " · Added to accounts" : ""}` : ""}${entry.detail ? ` · ${escapeHtml(entry.detail)}` : ""}</p></div><button class="delete-record" data-action="delete-record" data-area="production" data-record="${escapeHtml(entry.id)}" aria-label="Delete ${escapeHtml(entry.movementType)} log for ${escapeHtml(entry.itemName)}">×</button></article>`).join("")}</div>`
      : `<div class="area-empty management-empty"><div class="empty-illustration">${icon(area)}</div><h2>Start your production log</h2><p>Track milk, eggs, honey, crop harvests, feed use, restocking, and sales in the units that work for your farm.</p><button class="button button-soft" data-action="new-production-activity" data-area="production">＋ &nbsp; Add your first log</button></div>`}
    <div class="page-footer"><span>YOUR DATA BELONGS TO YOU</span><span>Production records saved locally · Works offline</span></div>`;
}

function employeeManagementPage(area) {
  const employees = entriesOf("employees", "employee")
    .sort((a, b) => (a.status === "Inactive") - (b.status === "Inactive") || a.employeeName.localeCompare(b.employeeName));
  const activities = entriesOf("employees", "employee-activity")
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  const legacyNotes = data.entries.employees.filter((entry) => !entry.type);
  const activeCount = employees.filter((employee) => employee.status === "Active").length;
  const hoursLogged = activities.reduce((total, activity) => total + (Number(activity.hours) || 0), 0);
  const totalPaid = activities.reduce((total, activity) => total + (Number(activity.amount) || 0), 0);

  return `
    ${managementHeader(area, "Keep your staff register, work logs, and employee payments together.", "new-employee", "Add employee")}
    <div class="management-stats"><div><strong>${employees.length}</strong><span>STAFF REGISTERED</span></div><div><strong>${activeCount}</strong><span>ACTIVE EMPLOYEES</span></div><div><strong>${formatAmount(totalPaid)}</strong><span>PAYMENTS LOGGED</span></div></div>
    <div class="employee-summary"><span><span class="offline-dot"></span> ${formatAmount(hoursLogged)} work hours logged</span><span>Employee pay amounts use the same currency as your farm accounts.</span></div>
    <div class="section-heading management-section-heading"><div><p class="eyebrow">YOUR FARM TEAM</p><h2>Employee register</h2></div><span class="local-tag"><span class="offline-dot"></span> Saved on this device</span></div>
    ${employees.length
      ? `<div class="employee-grid">${employees.map((employee) => `<article class="employee-card"><div class="employee-card-top"><span class="employee-avatar" aria-hidden="true">${escapeHtml((employee.employeeName || "?").trim().slice(0, 1).toUpperCase())}</span><span class="status-pill ${employee.status === "Active" ? "status-active" : employee.status === "On leave" ? "status-leave" : "status-muted"}">${escapeHtml(employee.status || "Active")}</span></div><h3>${escapeHtml(employee.employeeName)}</h3><p class="employee-role">${escapeHtml(employee.role || "Farm team member")}</p><div class="employee-details">${employee.phone ? `<span><span aria-hidden="true">☎</span> ${escapeHtml(employee.phone)}</span>` : ""}${employee.email ? `<span><span aria-hidden="true">✉</span> ${escapeHtml(employee.email)}</span>` : ""}${employee.startDate ? `<span><span aria-hidden="true">▦</span> Since ${escapeHtml(formatDate(employee.startDate))}</span>` : ""}</div><label class="status-control">Employment status<select data-field="employee-status" data-employee="${escapeHtml(employee.id)}" aria-label="Update ${escapeHtml(employee.employeeName)} status">${["Active", "On leave", "Inactive"].map((status) => `<option value="${status}" ${employee.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label><button class="employee-log-button" data-action="new-employee-activity" data-area="employees" data-employee="${escapeHtml(employee.id)}">＋ &nbsp; Log work or payment</button></article>`).join("")}</div>`
      : `<div class="area-empty management-empty"><div class="empty-illustration">${icon(area)}</div><h2>Introduce your farm team</h2><p>Keep staff roles and contact details in one convenient, private register.</p><button class="button button-soft" data-action="new-employee" data-area="employees">＋ &nbsp; Add your first employee</button></div>`}
    <div class="section-heading management-section-heading activity-heading"><div><p class="eyebrow">HOURS & PAYMENTS</p><h2>Work and payment log</h2></div><button class="button button-soft" data-action="new-employee-activity" data-area="employees" ${employees.length ? "" : "disabled"}>＋ &nbsp; Add log entry</button></div>
    ${activities.length
      ? `<div class="management-list">${activities.map((activity) => {
          const employee = employees.find((person) => person.id === activity.employeeId);
          return `<article class="management-list-item employee-activity-row"><div class="record-date">${escapeHtml(formatDate(activity.date))}</div><span class="activity-type ${activity.activityType === "Payment" ? "employee-payment-type" : ""}">${escapeHtml(activity.activityType || "Work log")}</span><div class="record-body"><h3>${escapeHtml(employee?.employeeName || activity.employeeName || "Former employee")}</h3><p>${escapeHtml(employee?.role || activity.employeeRole || "Farm employee")}${activity.hours ? ` · ${escapeHtml(activity.hours)} ${Number(activity.hours) === 1 ? "hour" : "hours"}` : ""}${activity.amount ? ` · Payment ${escapeHtml(formatAmount(activity.amount))}` : ""}${activity.detail ? ` · ${escapeHtml(activity.detail)}` : ""}</p></div><button class="delete-record" data-action="delete-record" data-area="employees" data-record="${escapeHtml(activity.id)}" aria-label="Delete ${escapeHtml(activity.activityType || "work log")} for ${escapeHtml(employee?.employeeName || activity.employeeName || "employee")}">×</button></article>`;
        }).join("")}</div>`
      : `<p class="management-hint">${employees.length ? "Record employee work hours or payments. Payments are automatically included in the accounting ledger as labor expenses." : "Add an employee before starting a work or payment log."}</p>`}
    ${renderFarmNotes("employees", legacyNotes, "Previous employee notes")}
    <div class="employee-privacy-note">Employee contact details and work logs stay on this device in this browser. Payroll entries added here are also recorded as labor expenses in your farm accounts.</div>
    <div class="page-footer"><span>YOUR DATA BELONGS TO YOU</span><span>Employee records saved locally · Works offline</span></div>`;
}

function renderFarmNotes(area, notes, heading) {
  if (!notes.length) return "";
  return `<section class="farm-notes"><div class="section-heading management-section-heading"><div><p class="eyebrow">EXISTING NOTES</p><h2>${escapeHtml(heading)}</h2></div></div><div class="management-list">${notes.map((entry) => `<article class="management-list-item"><div class="record-date">${escapeHtml(formatDate(entry.date))}</div><div class="record-body"><h3>${escapeHtml(recordHeading(entry))}</h3>${entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}</div><button class="delete-record" data-action="delete-record" data-area="${area}" data-record="${escapeHtml(entry.id)}" aria-label="Delete ${escapeHtml(recordHeading(entry))}">×</button></article>`).join("")}</div></section>`;
}

function prioritiesPage() {
  const selected = draftPriorities;
  return `
    <div class="settings-heading"><p class="eyebrow"><span class="eyebrow-line"></span> YOUR FARM, YOUR RULES</p><h1>Make it yours<span class="greeting-period">.</span></h1><p class="welcome-subtitle">Choose the areas that fit your farm today. You can always change them later.</p></div>
    <div class="settings-layout"><section class="settings-main"><div class="settings-section-head"><div><h2>Your farm areas</h2><p>Select what you want in your workspace and arrange them by importance.</p></div><span class="section-count">${selected.length} SELECTED</span></div>
      <div class="area-choices settings-choices">${AREAS.map((area) => choiceCard(area, selected)).join("")}</div>
      <div class="settings-bottom"><p><span class="offline-dot"></span> Your choices are saved on this device and work offline.</p><div><button class="button button-plain" data-action="dashboard">Cancel</button><button class="button button-primary" data-action="save-priorities" ${selected.length === 0 ? "disabled" : ""}>Save my priorities <span aria-hidden="true">→</span></button></div></div>
    </section><aside class="settings-aside"><span class="aside-flower">✳</span><p class="eyebrow">YOUR FIRST THINGS FIRST</p><h3>Start with what matters most.</h3><p>Use the arrows to put your most important area at the top. Your dashboard will follow your lead.</p><div class="priority-preview">${selected.length ? selected.map((id, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(areaFor(id).shortName)}${index === 0 ? '<b>FIRST</b>' : ""}</div>`).join("") : '<div class="preview-empty">Choose an area to get started.</div>'}</div></aside></div>
    <div class="settings-name"><div><h2>Give your farm a name</h2><p>Just for you. This stays on your device.</p></div><input type="text" id="settings-farm-name" maxlength="50" value="${escapeHtml(farmNameDraft)}" placeholder="e.g. Green Acres"><button class="button button-soft" data-action="save-name">Save name</button></div>
    <section class="backup-settings"><div><p class="eyebrow">KEEP YOUR RECORDS SAFE</p><h2>Backups & device storage</h2><p>Your farm data is saved in this browser using ${storageBackend === "indexeddb" ? "IndexedDB" : "the browser’s smaller local-storage fallback"}. ${escapeHtml(storageRetentionNote)} Export a backup regularly and keep it somewhere separate from this device.</p><p class="backup-warning">A browser account is not a backup. Clearing browser data or losing this device can remove locally stored records.</p></div><div class="backup-actions"><button class="button button-soft" data-action="export-backup">Download backup</button><button class="button button-plain" data-action="import-backup">Restore backup</button><input id="backup-file" type="file" accept=".json,application/json" hidden></div></section>
    <section class="catalog-settings"><div class="catalog-heading"><p class="eyebrow">MADE FOR YOUR FARM</p><h2>Crop and animal choices</h2><p>Add the crops and animal types you work with. They’ll appear as suggestions in your registers, and you can still enter any other type.</p></div><div class="catalog-grid">${catalogEditor("animals", "Animal types", "Examples: dairy cattle, goats, chickens, bees.", draftCatalog.animals)}${catalogEditor("crops", "Crops", "Examples: rice, cassava, tomatoes, or local varieties.", draftCatalog.crops)}</div></section>
    <footer class="page-footer"><span>FLEXIBLE BY DESIGN</span><span>Change your focus whenever you like.</span></footer>`;
}

function catalogEditor(type, title, description, options) {
  const label = type === "animals" ? "animal type" : "crop";
  const article = type === "animals" ? "an" : "a";
  return `<section class="catalog-card"><div class="catalog-card-heading"><div><h3>${title}</h3><p>${description}</p></div><span class="section-count">${options.length} ${options.length === 1 ? "OPTION" : "OPTIONS"}</span></div><ul class="catalog-list">${options.length ? options.map((option) => `<li><span>${escapeHtml(option)}</span><button type="button" class="catalog-remove" data-action="remove-catalog-item" data-catalog="${type}" data-value="${escapeHtml(option)}" aria-label="Remove ${escapeHtml(option)}">×</button></li>`).join("") : '<li class="catalog-empty">No saved suggestions. You can still enter any value.</li>'}</ul><form class="catalog-form" id="${type}-catalog-form" data-catalog="${type}"><label class="visually-hidden" for="${type}-catalog-input">Add ${article} ${label}</label><input id="${type}-catalog-input" name="option" maxlength="60" required placeholder="Add ${article} ${label}"><button class="button button-soft" type="submit">Add</button></form></section>`;
}

function renderModal() {
  if (!currentModal) return "";
  const area = areaFor(currentModal);
  const date = todayLocalDate();
  let formMarkup = "";
  let title = "Add a record";
  let intro = "Write it down now. It’ll be here even when you’re offline.";

  if (currentModalType === "transaction") {
    title = "Add transaction";
    intro = "Record money received or a farm cost. Enter amounts in your farm’s currency.";
    formMarkup = `
      <label for="transaction-type">Transaction type</label>
      <select id="transaction-type" name="transactionType" required><option value="expense">Expense — money out</option><option value="income">Income — money in</option></select>
      <label for="record-title">Description</label><input id="record-title" name="title" maxlength="100" required placeholder="e.g. Vet visit or grain sale">
      <label for="transaction-category">Category</label>
      <select id="transaction-category" name="category" required>${TRANSACTION_CATEGORIES.expense.map((category) => `<option>${category}</option>`).join("")}</select>
      <label for="record-amount">Amount <span>REQUIRED</span></label><input id="record-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00">
      <label for="record-date">Date</label><input id="record-date" name="date" type="date" value="${date}" required>
      <label for="record-detail">Notes <span>OPTIONAL</span></label><textarea id="record-detail" name="detail" rows="2" maxlength="300" placeholder="Receipt number or other details"></textarea>`;
  } else if (currentModalType === "production-activity") {
    title = "Log production or resource use";
    intro = "Track output, use, stock received, or sales. Keep units consistent for each item.";
    const animals = entriesOf("livestock", "animal").filter((animal) => animal.status === "Active");
    const crops = entriesOf("crops", "crop").filter((crop) => !["Failed"].includes(crop.status));
    formMarkup = `
      <label for="production-movement">Activity</label><select id="production-movement" name="movementType" required>${PRODUCTION_MOVEMENTS.map((movement) => `<option>${movement}</option>`).join("")}</select>
      <label for="production-item">Product or resource</label><input id="production-item" name="itemName" maxlength="80" required placeholder="e.g. Milk, eggs, maize, or animal feed">
      <label for="production-source">Linked animal or crop <span id="production-source-requirement">REQUIRED FOR PRODUCTION</span></label><select id="production-source" name="sourceId" required><option value="">General resource / not linked</option>${animals.length ? `<optgroup label="Animals">${animals.map((animal) => `<option value="livestock:${escapeHtml(animal.id)}">${escapeHtml(animal.animalName)} · ${escapeHtml(animal.species || "Animal")}</option>`).join("")}</optgroup>` : ""}${crops.length ? `<optgroup label="Crop cycles">${crops.map((crop) => `<option value="crops:${escapeHtml(crop.id)}">${escapeHtml(crop.cropName)} · ${escapeHtml(crop.fieldName)}</option>`).join("")}</optgroup>` : ""}</select>
      <label for="production-quantity">Quantity</label><input id="production-quantity" name="quantity" type="number" min="0.001" step="0.001" inputmode="decimal" required placeholder="e.g. 12">
      <label for="production-unit">Unit</label><input id="production-unit" name="unit" maxlength="24" required placeholder="e.g. kg, L, trays, or bags">
      <div id="production-sale-fields" hidden><label for="production-sale-amount">Sale amount <span>REQUIRED FOR SALES</span></label><input id="production-sale-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" disabled></div>
      <label for="record-date">Date</label><input id="record-date" name="date" type="date" value="${date}" required>
      <label for="record-detail">Notes <span>OPTIONAL</span></label><textarea id="record-detail" name="detail" rows="2" maxlength="300" placeholder="Buyer, batch, feed type, or other details"></textarea>`;
  } else if (currentModalType === "employee") {
    title = "Add an employee";
    intro = "Add the staff details you want to keep with your farm records.";
    formMarkup = `
      <label for="employee-name">Employee name <span>REQUIRED</span></label><input id="employee-name" name="employeeName" maxlength="80" required autocomplete="name" placeholder="e.g. Alex Morgan">
      <label for="employee-role">Farm role <span>OPTIONAL</span></label><input id="employee-role" name="role" maxlength="80" placeholder="e.g. Farm worker, milker, or supervisor">
      <label for="employee-phone">Phone <span>OPTIONAL</span></label><input id="employee-phone" name="phone" type="tel" maxlength="40" autocomplete="tel" placeholder="Phone number">
      <label for="employee-email">Email <span>OPTIONAL</span></label><input id="employee-email" name="email" type="email" maxlength="120" autocomplete="email" placeholder="name@example.com">
      <label for="employee-start-date">Start date <span>OPTIONAL</span></label><input id="employee-start-date" name="startDate" type="date" max="${date}">
      <label for="employee-type">Employment type</label><select id="employee-type" name="employmentType"><option>Full-time</option><option>Part-time</option><option>Seasonal</option><option>Casual</option><option>Contract</option></select>
      <label for="employee-detail">Notes <span>OPTIONAL</span></label><textarea id="employee-detail" name="detail" rows="2" maxlength="300" placeholder="Optional employment notes"></textarea>`;
  } else if (currentModalType === "employee-activity") {
    title = "Add an employee log";
    intro = "Record work hours or a payment. Payments are automatically entered as labor expenses.";
    const employees = entriesOf("employees", "employee");
    formMarkup = `
      <label for="activity-employee">Employee</label><select id="activity-employee" name="employeeId" required>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === currentModalEmployeeId ? "selected" : ""}>${escapeHtml(employee.employeeName)} · ${escapeHtml(employee.status || "Active")}</option>`).join("")}</select>
      <label for="employee-activity-type">Entry type</label><select id="employee-activity-type" name="activityType" required><option>Work shift</option><option>Payment</option></select>
      <label for="record-date">Date</label><input id="record-date" name="date" type="date" value="${date}" required>
      <label for="employee-hours">Hours worked <span id="employee-hours-requirement">REQUIRED FOR SHIFTS</span></label><input id="employee-hours" name="hours" type="number" min="0.1" max="24" step="0.01" inputmode="decimal" required placeholder="e.g. 8">
      <label for="employee-payment-amount">Payment amount <span id="employee-payment-requirement">OPTIONAL FOR SHIFTS</span></label><input id="employee-payment-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00">
      <label for="record-detail">Notes <span>OPTIONAL</span></label><textarea id="record-detail" name="detail" rows="2" maxlength="300" placeholder="Shift, pay period, or other details"></textarea>`;
  } else if (currentModalType === "animal") {
    title = "Register an animal";
    intro = "Add the details you use to identify and care for this animal.";
    formMarkup = `
      <label for="animal-name">Animal name <span>REQUIRED</span></label><input id="animal-name" name="animalName" maxlength="80" required placeholder="e.g. Daisy">
      <label for="animal-tag">Ear tag or ID <span>OPTIONAL</span></label><input id="animal-tag" name="tag" maxlength="50" placeholder="e.g. C-104">
      <label for="animal-species">Animal type or species</label><input id="animal-species" name="species" maxlength="60" list="animal-type-options" required placeholder="e.g. Cattle, chickens, or bees"><datalist id="animal-type-options">${data.catalog.animals.map((species) => `<option value="${escapeHtml(species)}"></option>`).join("")}</datalist>
      <label for="animal-breed">Breed <span>OPTIONAL</span></label><input id="animal-breed" name="breed" maxlength="60" placeholder="e.g. Holstein">
      <label for="animal-sex">Sex</label><select id="animal-sex" name="sex"><option value="">Not recorded</option><option>Female</option><option>Male</option><option>Unknown</option></select>
      <label for="animal-birth-date">Date of birth <span>OPTIONAL</span></label><input id="animal-birth-date" name="birthDate" type="date" max="${date}">
      <label for="animal-weight">Latest weight <span>OPTIONAL</span></label><div class="input-pair"><input id="animal-weight" name="weight" type="number" min="0" step="0.1" placeholder="e.g. 420"><select name="weightUnit" aria-label="Weight unit"><option>kg</option><option>lb</option></select></div>`;
  } else if (currentModalType === "animal-activity") {
    title = "Log an animal activity";
    intro = "Keep a dated health, breeding, weight, or care note with the animal record.";
    const animals = entriesOf("livestock", "animal").filter((animal) => animal.status === "Active");
    formMarkup = `
      <label for="activity-animal">Animal</label><select id="activity-animal" name="animalId" required>${animals.map((animal) => `<option value="${escapeHtml(animal.id)}" ${animal.id === currentModalAnimalId ? "selected" : ""}>${escapeHtml(animal.animalName)}${animal.tag ? ` · ${escapeHtml(animal.tag)}` : ""}</option>`).join("")}</select>
      <label for="activity-type">Activity</label><select id="activity-type" name="activityType" required>${["Health check", "Vaccination", "Treatment", "Breeding", "Weight check", "Other care"].map((type) => `<option>${type}</option>`).join("")}</select>
      <label for="record-title">Summary</label><input id="record-title" name="title" maxlength="100" required placeholder="e.g. Spring vaccination">
      <label for="record-date">Date</label><input id="record-date" name="date" type="date" value="${date}" required>
      <label for="activity-weight">Weight recorded <span>OPTIONAL</span></label><div class="input-pair"><input id="activity-weight" name="weight" type="number" min="0.1" step="0.1" placeholder="e.g. 430"><select name="weightUnit" aria-label="Weight unit"><option>kg</option><option>lb</option></select></div>
      <label for="record-detail">Notes <span>OPTIONAL</span></label><textarea id="record-detail" name="detail" rows="3" maxlength="300" placeholder="Treatment, dose, observations, or follow-up"></textarea>`;
  } else if (currentModalType === "crop") {
    title = "Add a crop cycle";
    intro = "Track a crop in a field from planning and planting through harvest.";
    formMarkup = `
      <label for="crop-name">Crop or variety</label><input id="crop-name" name="cropName" maxlength="80" list="crop-type-options" required placeholder="e.g. Wheat, tomatoes, or an orchard"><datalist id="crop-type-options">${data.catalog.crops.map((crop) => `<option value="${escapeHtml(crop)}"></option>`).join("")}</datalist>
      <label for="crop-field">Field or plot</label><input id="crop-field" name="fieldName" maxlength="80" required placeholder="e.g. North field">
      <label for="crop-size">Field size <span>OPTIONAL</span></label><div class="input-pair"><input id="crop-size" name="fieldSize" type="number" min="0" step="0.01" placeholder="e.g. 2.5"><select name="fieldUnit" aria-label="Field area unit"><option value="ha">hectares</option><option value="ac">acres</option></select></div>
      <label for="crop-status">Status</label><select id="crop-status" name="status" required><option>Planned</option><option>Planted</option><option>Growing</option><option>Harvested</option><option>Failed</option></select>
      <label for="crop-planting-date">Planting date <span>OPTIONAL</span></label><input id="crop-planting-date" name="plantingDate" type="date">
      <label for="crop-harvest-date">Expected harvest <span>OPTIONAL</span></label><input id="crop-harvest-date" name="expectedHarvestDate" type="date">
      <label for="record-detail">Notes <span>OPTIONAL</span></label><textarea id="record-detail" name="detail" rows="2" maxlength="300" placeholder="Variety, rotation, or growing notes"></textarea>`;
  } else {
    formMarkup = `<label for="record-title">What would you like to remember?</label><input id="record-title" name="title" maxlength="100" required placeholder="${modalTitleHint(area.id)}"><label for="record-detail">A few more details <span>OPTIONAL</span></label><textarea id="record-detail" name="detail" rows="3" maxlength="300" placeholder="Add any helpful details…"></textarea><label for="record-date">Date</label><input id="record-date" name="date" type="date" value="${date}" required>`;
  }

  return `<div class="modal-backdrop"><section class="record-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" data-action="close-modal" aria-label="Close">×</button>${icon(area)}<p class="eyebrow">${escapeHtml(area.shortName.toUpperCase())}</p><h2 id="modal-title">${escapeHtml(title)}</h2><p class="modal-intro">${escapeHtml(intro)}</p><form id="record-form" data-area="${area.id}" data-type="${currentModalType}">${formMarkup}<div class="modal-actions"><button type="button" class="button button-plain" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">${currentModalType === "animal" ? "Save animal" : currentModalType === "crop" ? "Save crop" : currentModalType === "transaction" ? "Save transaction" : currentModalType === "production-activity" ? "Save log" : "Save record"}</button></div></form></section></div>`;
}

let currentModal = null;
let currentModalType = "note";
let currentModalAnimalId = "";
let currentModalEmployeeId = "";

function modalTitleHint(id) {
  return ({
    livestock: "e.g. Check the north herd",
    finance: "e.g. Feed purchase",
    tasks: "e.g. Check the north fence",
    crops: "e.g. Planted east field",
    production: "e.g. Record today's farm output"
  })[id];
}

app.addEventListener("click", async (event) => {
  if (event.target.matches(".modal-backdrop")) {
    currentModal = null;
    render();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, area, direction, record } = button.dataset;

  if (action === "dashboard") {
    currentView = "dashboard";
    currentModal = null;
    render();
  } else if (action === "priorities") {
    currentView = "priorities";
    currentModal = null;
    draftPriorities = [...data.priorities];
    farmNameDraft = data.farmName;
    draftCatalog = copyCatalog(data.catalog);
    render();
  } else if (action === "open-area") {
    currentView = area;
    currentModal = null;
    render();
  } else if (action === "move-priority") {
    const index = draftPriorities.indexOf(area);
    const nextIndex = index + Number(direction);
    if (index < 0 || nextIndex < 0 || nextIndex >= draftPriorities.length) return;
    [draftPriorities[index], draftPriorities[nextIndex]] = [draftPriorities[nextIndex], draftPriorities[index]];
    render();
  } else if (action === "save-priorities") {
    data.priorities = [...draftPriorities];
    if (await saveData()) {
      currentView = "dashboard";
      render();
      showToast("Your farm priorities are saved.");
    }
  } else if (action === "save-name") {
    const input = document.querySelector("#settings-farm-name");
    data.farmName = input.value.trim();
    farmNameDraft = data.farmName;
    if (await saveData()) {
      render();
      showToast("Your farm name is saved.");
    }
  } else if (action === "remove-catalog-item") {
    const type = button.dataset.catalog;
    const value = button.dataset.value;
    if (!["animals", "crops"].includes(type) || !value || !draftCatalog) return;
    if (await updateCatalog((catalog) => {
      catalog[type] = catalog[type].filter((option) => option !== value);
    })) {
      render();
      showToast("Suggestion removed. Existing records are unchanged.");
    }
  } else if (action === "export-backup") {
    downloadBackup(makeBackup(), `fieldnote-backup-${todayLocalDate()}.json`);
    showToast("Backup downloaded. Store a copy somewhere safe.");
  } else if (action === "import-backup") {
    document.querySelector("#backup-file")?.click();
  } else if (action === "download-recovery") {
    downloadBackup(recoveryPayload, `fieldnote-recovery-${todayLocalDate()}.json`);
    showToast("Recovery copy downloaded. Keep it unchanged.");
  } else if (action === "install-app") {
    await installApp();
  } else if (["new-record", "new-transaction", "new-animal", "new-animal-activity", "new-crop-cycle", "new-production-activity", "new-employee", "new-employee-activity"].includes(action)) {
    currentModalType = ({
      "new-record": "note",
      "new-transaction": "transaction",
      "new-animal": "animal",
      "new-animal-activity": "animal-activity",
      "new-crop-cycle": "crop",
      "new-production-activity": "production-activity",
      "new-employee": "employee",
      "new-employee-activity": "employee-activity"
    })[action];
    currentModal = area;
    currentModalAnimalId = button.dataset.animal || "";
    currentModalEmployeeId = button.dataset.employee || "";
    render();
    document.querySelector("#record-title, #animal-name, #crop-name, #employee-name, #activity-employee")?.focus();
  } else if (action === "close-modal") {
    currentModal = null;
    render();
  } else if (action === "delete-record") {
    const entry = data.entries[area].find((item) => item.id === record);
    if (!entry) return;
    if (
      area === "production" &&
      entry.type === "production-activity" &&
      ["Production", "Stock received"].includes(entry.movementType)
    ) {
      const stockItem = productionStock().find((item) =>
        item.itemName.toLocaleLowerCase() === String(entry.itemName).toLocaleLowerCase() &&
        item.unit.toLocaleLowerCase() === String(entry.unit).toLocaleLowerCase()
      );
      if (stockItem && stockItem.quantity - Number(entry.quantity) < -0.000001) {
        showToast("This stock has already been consumed or sold. Delete the later use or sale first.");
        return;
      }
    }
    if (!window.confirm(`Delete “${recordHeading(entry)}”? This can’t be undone.`)) return;
    const removedEntries = [{ records: data.entries[area], entry }];
    if (area === "employees" && entry.type === "employee-activity" && entry.activityType === "Payment") {
      const ledgerEntry = data.entries.finance.find((item) => item.employeePaymentId === entry.id);
      if (ledgerEntry) removedEntries.push({ records: data.entries.finance, entry: ledgerEntry });
    } else if (area === "production" && entry.type === "production-activity" && entry.movementType === "Sale") {
      const ledgerEntry = data.entries.finance.find((item) => item.productionSaleId === entry.id);
      if (ledgerEntry) removedEntries.push({ records: data.entries.finance, entry: ledgerEntry });
    } else if (area === "finance" && entry.type === "transaction" && entry.employeePaymentId) {
      const paymentEntry = data.entries.employees.find((item) => item.id === entry.employeePaymentId);
      if (paymentEntry) removedEntries.push({ records: data.entries.employees, entry: paymentEntry });
    } else if (area === "finance" && entry.type === "transaction" && entry.productionSaleId) {
      const saleEntry = data.entries.production.find((item) => item.id === entry.productionSaleId);
      if (saleEntry) removedEntries.push({ records: data.entries.production, entry: saleEntry });
    }
    const savedEntries = removedEntries.map((item) => ({
      ...item,
      index: item.records.indexOf(item.entry)
    }));
    const animal = entry.type === "animal-activity" && entry.weight
      ? data.entries.livestock.find((item) => item.id === entry.animalId && item.type === "animal")
      : null;
    const previousWeight = animal ? { weight: animal.weight, weightUnit: animal.weightUnit } : null;
    for (const removed of savedEntries.sort((a, b) => b.index - a.index)) {
      removed.records.splice(removed.index, 1);
    }
    if (animal) Object.assign(animal, currentAnimalWeight(animal));
    if (await saveData()) {
      render();
      showToast(entry.employeePaymentId || entry.activityType === "Payment"
        ? "Employee payment and matching accounting entry deleted."
        : entry.productionSaleId || entry.movementType === "Sale"
          ? "Sale and matching accounting entry deleted."
          : "Record deleted.");
    } else {
      for (const removed of savedEntries.sort((a, b) => a.index - b.index)) {
        removed.records.splice(removed.index, 0, removed.entry);
      }
      if (animal && previousWeight) Object.assign(animal, previousWeight);
    }
  }
});

function updateInstallButtons() {
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  document.querySelectorAll(".install-app-button").forEach((button) => {
    button.hidden = installed || !deferredInstallPrompt;
  });
}

async function installApp() {
  if (!deferredInstallPrompt) {
    const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(isAppleMobile
      ? "In Safari, tap Share, then Add to Home Screen."
      : "Use your browser’s Install app or Add to Home Screen option.");
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  updateInstallButtons();
  try {
    await promptEvent.prompt();
    const result = await promptEvent.userChoice;
    if (result.outcome === "accepted") showToast("Fieldnote is being installed.");
  } catch (error) {
    console.error("The browser could not show its install prompt.", error);
    showToast("Your browser could not start installation. Try its Install app option.");
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtons();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallButtons();
  showToast("Fieldnote was installed on this device.");
});

window.matchMedia("(display-mode: standalone)").addEventListener?.("change", updateInstallButtons);

app.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.matches("#backup-file")) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== BACKUP_FORMAT || backup.schemaVersion !== 1) {
        throw new Error("This file is not a supported Fieldnote backup.");
      }
      const restoredData = normalizeData(backup.data);
      if (!window.confirm(`Restore “${restoredData.farmName || "My farm"}” from this backup? This replaces the farm data currently in this browser.`)) return;
      const previousData = data;
      data = restoredData;
      if (await saveData()) {
        currentView = "dashboard";
        farmNameDraft = data.farmName;
        recoveryPayload = "";
        render();
        showToast("Backup restored. Download a fresh backup after making changes.");
      } else {
        data = previousData;
      }
    } catch (error) {
      console.error("Could not restore the selected backup.", error);
      showToast(error instanceof SyntaxError ? "The selected file is not valid JSON." : error.message || "The backup could not be restored.");
    }
  } else if (input.matches('input[name="area"]')) {
    const priorities = draftPriorities;
    if (input.checked && !priorities.includes(input.value)) priorities.push(input.value);
    if (!input.checked) {
      const index = priorities.indexOf(input.value);
      if (index !== -1) priorities.splice(index, 1);
    }
    render();
  } else if (input.matches("#transaction-type")) {
    const categories = TRANSACTION_CATEGORIES[input.value];
    const categoryInput = document.querySelector("#transaction-category");
    if (!categories || !categoryInput) return;
    const previousCategory = categoryInput.value;
    categoryInput.innerHTML = categories.map((category) => `<option>${category}</option>`).join("");
    categoryInput.value = categories.includes(previousCategory) ? previousCategory : categories[0];
  } else if (input.matches("#production-movement")) {
    const isSale = input.value === "Sale";
    const requiresSource = input.value === "Production";
    const saleFields = document.querySelector("#production-sale-fields");
    const saleAmount = document.querySelector("#production-sale-amount");
    const source = document.querySelector("#production-source");
    const sourceRequirement = document.querySelector("#production-source-requirement");
    if (!saleFields || !saleAmount || !source || !sourceRequirement) return;
    saleFields.hidden = !isSale;
    saleAmount.disabled = !isSale;
    saleAmount.required = isSale;
    source.required = requiresSource;
    sourceRequirement.textContent = requiresSource ? "REQUIRED FOR PRODUCTION" : "OPTIONAL";
  } else if (input.matches("#production-source")) {
    const itemInput = document.querySelector("#production-item");
    if (!itemInput || itemInput.value.trim()) return;
    const [sourceArea, sourceId] = input.value.split(":");
    const sourceRecord = ["livestock", "crops"].includes(sourceArea)
      ? data.entries[sourceArea].find((item) => item.id === sourceId)
      : null;
    if (!sourceRecord) return;
    itemInput.value = sourceArea === "livestock"
      ? sourceRecord.species || sourceRecord.animalName || ""
      : sourceRecord.cropName || "";
  } else if (input.matches("#employee-activity-type")) {
    const isPayment = input.value === "Payment";
    const hoursInput = document.querySelector("#employee-hours");
    const amountInput = document.querySelector("#employee-payment-amount");
    const hoursRequirement = document.querySelector("#employee-hours-requirement");
    const amountRequirement = document.querySelector("#employee-payment-requirement");
    if (!hoursInput || !amountInput || !hoursRequirement || !amountRequirement) return;
    hoursInput.required = !isPayment;
    amountInput.required = isPayment;
    amountInput.disabled = !isPayment;
    hoursRequirement.textContent = isPayment ? "OPTIONAL FOR PAYMENTS" : "REQUIRED FOR SHIFTS";
    amountRequirement.textContent = isPayment ? "REQUIRED FOR PAYMENTS" : "NOT APPLICABLE";
  } else if (input.matches('[data-field="animal-status"]')) {
    const animal = data.entries.livestock.find((entry) => entry.id === input.dataset.animal && entry.type === "animal");
    if (!animal || !["Active", "Sold", "Deceased", "Archived"].includes(input.value)) return;
    const previousStatus = animal.status;
    animal.status = input.value;
    if (await saveData()) showToast("Animal status updated.");
    else animal.status = previousStatus;
    render();
  } else if (input.matches('[data-field="crop-status"]')) {
    const crop = data.entries.crops.find((entry) => entry.id === input.dataset.crop && entry.type === "crop");
    if (!crop || !["Planned", "Planted", "Growing", "Harvested", "Failed"].includes(input.value)) return;
    const previousStatus = crop.status;
    crop.status = input.value;
    if (await saveData()) showToast("Crop cycle status updated.");
    else crop.status = previousStatus;
    render();
  } else if (input.matches('[data-field="employee-status"]')) {
    const employee = data.entries.employees.find((entry) => entry.id === input.dataset.employee && entry.type === "employee");
    if (!employee || !["Active", "On leave", "Inactive"].includes(input.value)) return;
    const previousStatus = employee.status;
    employee.status = input.value;
    if (await saveData()) showToast("Employee status updated.");
    else employee.status = previousStatus;
    render();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.matches("#farm-name, #settings-farm-name")) {
    farmNameDraft = event.target.value;
  }
});

app.addEventListener("submit", async (event) => {
  if (event.target.id === "setup-form") {
    event.preventDefault();
    if (!draftPriorities.length) return;
    farmNameDraft = event.target.elements.farmName.value.trim();
    data = { schemaVersion: DATA_SCHEMA_VERSION, farmName: farmNameDraft, priorities: [...draftPriorities], catalog: copyCatalog(), entries: emptyEntries() };
    if (await saveData()) {
      currentView = "dashboard";
      render();
      showToast("Your farm workspace is ready.");
    }
  } else if (event.target.matches(".catalog-form")) {
    event.preventDefault();
    const form = event.target;
    const type = form.dataset.catalog;
    const value = String(new FormData(form).get("option") || "").trim().slice(0, 60);
    if (!["animals", "crops"].includes(type) || !value || !draftCatalog) {
      showToast("Enter a valid crop or animal type.");
      return;
    }
    if (draftCatalog[type].some((option) => option.toLowerCase() === value.toLowerCase())) {
      showToast("That suggestion is already in your list.");
      return;
    }
    if (await updateCatalog((catalog) => catalog[type].push(value))) {
      render();
      showToast("Suggestion saved on this device.");
    }
  } else if (event.target.id === "record-form") {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const getValue = (name) => String(formData.get(name) || "").trim();
    const type = form.dataset.type || "note";
    const date = getValue("date");
    let animalWithNewWeight = null;
    let previousAnimalWeight;
    let previousAnimalWeightUnit;
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date,
      createdAt: Date.now()
    };

    if (type === "production-activity") {
      const movementType = getValue("movementType");
      const itemName = getValue("itemName");
      const unit = getValue("unit");
      const quantityText = getValue("quantity");
      const quantity = Number(quantityText);
      const sourceSelection = getValue("sourceId");
      const sourceOptions = [
        ...entriesOf("livestock", "animal")
          .filter((animal) => animal.status === "Active")
          .map((animal) => ({ area: "livestock", entry: animal })),
        ...entriesOf("crops", "crop")
          .filter((crop) => crop.status !== "Failed")
          .map((crop) => ({ area: "crops", entry: crop }))
      ];
      const source = sourceOptions.find(({ area: sourceArea, entry: sourceEntry }) =>
        `${sourceArea}:${sourceEntry.id}` === sourceSelection
      );
      if (!PRODUCTION_MOVEMENTS.includes(movementType) || !itemName || !unit) {
        showToast("Choose an activity and enter a product or resource and unit.");
        return;
      }
      if (!/^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(quantityText) || !Number.isFinite(quantity) || quantity <= 0) {
        showToast("Enter a quantity greater than zero with no more than three decimal places.");
        return;
      }
      if (movementType === "Production" && !source) {
        showToast("Choose the animal or crop cycle that produced this output.");
        return;
      }
      if (sourceSelection && !source) {
        showToast("Choose a valid animal or crop record.");
        return;
      }
      const matchingStock = productionStock().find((item) =>
        item.itemName.toLocaleLowerCase() === itemName.toLocaleLowerCase() &&
        item.unit.toLocaleLowerCase() === unit.toLocaleLowerCase()
      );
      if (
        ["Consumption", "Sale"].includes(movementType) &&
        (!matchingStock || quantity > matchingStock.quantity + 0.000001)
      ) {
        showToast(`Not enough ${itemName} in ${unit} is recorded as available.`);
        return;
      }
      const amountText = getValue("amount");
      const amount = Number(amountText);
      if (movementType === "Sale" && (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(amountText) || !Number.isFinite(amount) || amount <= 0)) {
        showToast("Enter a sale amount greater than zero with no more than two decimal places.");
        return;
      }
      entry.type = "production-activity";
      entry.movementType = movementType;
      entry.itemName = itemName;
      entry.quantity = Math.round(quantity * 1000) / 1000;
      entry.unit = unit;
      entry.amount = movementType === "Sale" ? Math.round(amount * 100) / 100 : 0;
      entry.sourceArea = source?.area || "";
      entry.sourceId = source?.entry.id || "";
      entry.sourceName = source ? productionSourceLabel({ sourceArea: source.area, sourceId: source.entry.id }) : "";
      entry.title = `${movementType}: ${itemName}`;
      entry.detail = getValue("detail");
    } else if (type === "employee") {
      const employeeName = getValue("employeeName");
      const employmentType = getValue("employmentType");
      if (!employeeName || !["Full-time", "Part-time", "Seasonal", "Casual", "Contract"].includes(employmentType)) {
        showToast("Enter an employee name and choose a valid employment type.");
        return;
      }
      entry.type = "employee";
      entry.title = employeeName;
      entry.employeeName = entry.title;
      entry.role = getValue("role");
      entry.phone = getValue("phone");
      entry.email = getValue("email");
      entry.startDate = getValue("startDate");
      entry.employmentType = employmentType;
      entry.detail = getValue("detail");
      entry.status = "Active";
    } else if (type === "employee-activity") {
      const employee = data.entries.employees.find((item) =>
        item.id === getValue("employeeId") && item.type === "employee"
      );
      if (!employee) {
        showToast("Choose an employee before adding a staff log.");
        return;
      }
      const activityType = getValue("activityType");
      const hoursText = getValue("hours");
      const paymentText = getValue("amount");
      if (!["Work shift", "Payment"].includes(activityType)) {
        showToast("Choose a valid employee log entry type.");
        return;
      }
      if (activityType === "Work shift" && (!/^\d+(?:\.\d{1,2})?$/.test(hoursText) || Number(hoursText) <= 0 || Number(hoursText) > 24)) {
        showToast("Enter shift hours greater than zero and no more than 24.");
        return;
      }
      if (activityType === "Payment" && hoursText && (!/^\d+(?:\.\d{1,2})?$/.test(hoursText) || Number(hoursText) <= 0 || Number(hoursText) > 24)) {
        showToast("Enter shift hours greater than zero and no more than 24.");
        return;
      }
      if (activityType === "Payment" && (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(paymentText) || !Number.isFinite(Number(paymentText)) || Number(paymentText) <= 0)) {
        showToast("Enter a payment greater than zero with no more than two decimal places.");
        return;
      }

      entry.type = "employee-activity";
      entry.employeeId = employee.id;
      entry.employeeName = employee.employeeName;
      entry.employeeRole = employee.role;
      entry.activityType = activityType;
      entry.title = `${employee.employeeName} · ${activityType === "Payment" ? "Payment" : "Work shift"}`;
      entry.hours = hoursText ? Number(hoursText) : 0;
      entry.amount = activityType === "Payment" ? Math.round(Number(paymentText) * 100) / 100 : 0;
      entry.detail = getValue("detail");
    } else if (type === "transaction") {
      const rawAmount = getValue("amount");
      const amount = Number(rawAmount);
      const transactionType = getValue("transactionType");
      const category = getValue("category");
      if (!Object.prototype.hasOwnProperty.call(TRANSACTION_CATEGORIES, transactionType) || !TRANSACTION_CATEGORIES[transactionType].includes(category)) {
        showToast("Choose a valid transaction type and category.");
        return;
      }
      if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(rawAmount) || !Number.isFinite(amount) || amount <= 0) {
        showToast("Enter an amount greater than zero with no more than two decimal places.");
        return;
      }
      entry.type = "transaction";
      entry.transactionType = transactionType;
      entry.category = category;
      entry.title = getValue("title");
      entry.amount = Math.round(amount * 100) / 100;
      entry.detail = getValue("detail");
    } else if (type === "animal") {
      entry.type = "animal";
      entry.title = getValue("animalName");
      entry.animalName = entry.title;
      entry.tag = getValue("tag");
      entry.species = getValue("species");
      entry.breed = getValue("breed");
      entry.sex = getValue("sex");
      entry.birthDate = getValue("birthDate");
      entry.weight = getValue("weight");
      entry.weightUnit = getValue("weightUnit");
      entry.initialWeight = entry.weight;
      entry.initialWeightUnit = entry.weight ? entry.weightUnit : "";
      entry.status = "Active";
    } else if (type === "animal-activity") {
      const animal = data.entries.livestock.find((item) => item.id === getValue("animalId") && item.type === "animal" && item.status === "Active");
      if (!animal) {
        showToast("Choose an active animal before logging an activity.");
        return;
      }
      entry.type = "animal-activity";
      entry.animalId = animal.id;
      entry.activityType = getValue("activityType");
      entry.title = getValue("title");
      entry.detail = getValue("detail");
      const rawWeight = getValue("weight");
      if (rawWeight) {
        const weight = Number(rawWeight);
        if (!Number.isFinite(weight) || weight <= 0) {
          showToast("Enter a recorded animal weight greater than zero.");
          return;
        }
        entry.weight = weight;
        entry.weightUnit = getValue("weightUnit");
        animalWithNewWeight = animal;
        previousAnimalWeight = animal.weight;
        previousAnimalWeightUnit = animal.weightUnit;
      }
    } else if (type === "crop") {
      const plantingDate = getValue("plantingDate");
      const expectedHarvestDate = getValue("expectedHarvestDate");
      if (plantingDate && expectedHarvestDate && expectedHarvestDate < plantingDate) {
        showToast("The expected harvest date can’t be before the planting date.");
        return;
      }
      entry.type = "crop";
      entry.cropName = getValue("cropName");
      entry.fieldName = getValue("fieldName");
      entry.title = `${entry.cropName} · ${entry.fieldName}`;
      entry.fieldSize = getValue("fieldSize");
      entry.fieldUnit = getValue("fieldUnit");
      entry.status = getValue("status");
      entry.plantingDate = plantingDate;
      entry.expectedHarvestDate = expectedHarvestDate;
      entry.detail = getValue("detail");
    } else {
      entry.title = getValue("title");
      entry.detail = getValue("detail");
      entry.amount = getValue("amount");
    }

    const records = data.entries[form.dataset.area];
    records.push(entry);
    let linkedFinanceEntry = null;
    if (type === "employee-activity" && entry.activityType === "Payment") {
      linkedFinanceEntry = {
        id: `payroll-${entry.id}`,
        type: "transaction",
        employeePaymentId: entry.id,
        transactionType: "expense",
        category: "Labor",
        title: `Payroll — ${entry.employeeName}`,
        amount: entry.amount,
        date: entry.date,
        detail: `Employee payment${entry.detail ? ` · ${entry.detail}` : ""}`,
        createdAt: entry.createdAt
      };
    } else if (type === "production-activity" && entry.movementType === "Sale") {
      linkedFinanceEntry = {
        id: `production-sale-${entry.id}`,
        type: "transaction",
        productionSaleId: entry.id,
        transactionType: "income",
        category: entry.sourceArea === "livestock" ? "Livestock sales" : "Produce sales",
        title: `${entry.itemName} sale`,
        amount: entry.amount,
        date: entry.date,
        detail: `${entry.quantity} ${entry.unit} sold${entry.detail ? ` · ${entry.detail}` : ""}`,
        createdAt: entry.createdAt
      };
      entry.financeTransactionId = linkedFinanceEntry.id;
    }
    if (linkedFinanceEntry) data.entries.finance.push(linkedFinanceEntry);
    if (animalWithNewWeight) Object.assign(animalWithNewWeight, currentAnimalWeight(animalWithNewWeight));
    if (!(await saveData())) {
      records.pop();
      if (linkedFinanceEntry) data.entries.finance.pop();
      if (animalWithNewWeight) {
        animalWithNewWeight.weight = previousAnimalWeight;
        animalWithNewWeight.weightUnit = previousAnimalWeightUnit;
      }
      return;
    }

    currentModal = null;
    render();
    showToast(type === "animal" ? "Animal added to your register." : type === "crop" ? "Crop cycle saved." : type === "employee" ? "Employee added to your team." : type === "employee-activity" ? entry.activityType === "Payment" ? "Employee payment saved and added to labor expenses." : "Employee work shift saved." : type === "production-activity" ? entry.movementType === "Sale" ? "Sale saved, stock updated, and income added to accounts." : "Production and resource log saved; available stock updated." : type === "transaction" ? "Transaction saved." : "Your record has been saved.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && currentModal) {
    currentModal = null;
    render();
  }
});

function renderRecovery(error) {
  app.innerHTML = `<main class="recovery-screen"><section class="recovery-card"><p class="eyebrow">YOUR FARM DATA</p><h1>We couldn’t safely open these records.</h1><p>${escapeHtml(error.message || "The saved data is unavailable.")}</p><p>Your saved data has not been replaced. Restore a known-good Fieldnote backup, or download an unchanged copy of the stored data for recovery.</p><div class="recovery-actions"><button class="button button-primary" data-action="import-backup">Restore backup</button>${recoveryPayload ? '<button class="button button-plain" data-action="download-recovery">Download recovery copy</button>' : ""}</div><input id="backup-file" type="file" accept=".json,application/json" hidden></section></main>`;
}

async function initialize() {
  try {
    data = await loadData();
    const persisted = await window.FieldnoteStorage.requestPersistentStorage();
    storageRetentionNote = persisted
      ? "This browser granted protection against automatic storage eviction."
      : "This browser could not promise protection against automatic storage eviction.";
    const estimate = await window.FieldnoteStorage.estimateStorage();
    if (Number.isFinite(estimate?.usage) && Number.isFinite(estimate?.quota) && estimate.quota > 0) {
      storageRetentionNote += ` Browser estimate: ${formatStorageSize(estimate.usage)} used of ${formatStorageSize(estimate.quota)} available for this site.`;
    }
    if (!data) draftPriorities = [];
    else farmNameDraft = data.farmName;
    render();
  } catch (error) {
    renderRecovery(error);
  }
}

void initialize();
updateInstallButtons();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.error("Offline support could not be registered.", error);
    showToast("Offline support could not be enabled in this browser.");
  });
}
