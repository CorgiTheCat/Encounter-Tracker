let OBR = null;
let isImage = () => false;
let buildImage = null;
let downloadImages = null;
let resolveOBRReady;
const OBRReady = new Promise((resolve) => { resolveOBRReady = resolve; });
let contextMenuReady = false;
let connectionStatus = "connecting";
let connectionMessage = "Connecting to Owlbear…";
let connectionAttempt = 0;
let connectionGeneration = 0;
let connectionTimer;
let sdkImport;
let sdkLoadAttempt = 0;
let lifecycleInstalled = false;
let sceneSubscriptions = [];
let cancelReadyWait;

const KEY = "com.local.encounter-tracker/data";
const ROOM_KEY = "com.local.encounter-tracker/room";
const CONTROL_KEY = "com.local.encounter-tracker/turn-controllers";
let localRole = null;
let localPlayerId = null;
let allowPlayerTurns = false;
let controlsReady = false;
let savingControls = false;

function canAdvanceCombat() {
  return controlsReady && (localRole === "GM" || (localRole === "PLAYER" && allowPlayerTurns));
}

function applyTurnControls(metadata) {
  // Old per-player grants are replaced by an explicit, default-off room switch.
  allowPlayerTurns = metadata?.[CONTROL_KEY]?.allowPlayers === true;
}

function turnControlsMarkup() {
  if (!controlsReady || localRole !== "GM") return "";
  return `<label class="turn-permission-switch" title="Allow players to advance turns in Encounter"><span><strong>Player turns</strong><small>${savingControls ? 'Saving…' : allowPlayerTurns ? 'ON · Everyone' : 'OFF · DM only'}</small></span><input type="checkbox" role="switch" aria-label="Allow players to advance turns" data-player-turns ${allowPlayerTurns ? 'checked' : ''} ${savingControls ? 'disabled' : ''}><span class="switch-track" aria-hidden="true"></span></label>`;
}

async function setPlayerTurns(allowed) {
  if (!controlsReady || localRole !== "GM" || savingControls) return;
  savingControls = true;
  render();
  try {
    if (await OBR.player.getRole() !== "GM") return;
    await OBR.room.setMetadata({ [CONTROL_KEY]: { allowPlayers: allowed === true } });
    allowPlayerTurns = allowed === true;
  } catch (error) {
    console.warn("Could not save turn permissions", error);
    alert("Could not save turn permissions. Please try again.");
  } finally {
    savingControls = false;
    render();
  }
}

let lastAppliedUpdate = 0;
let persistQueue = Promise.resolve();

let state = {
  running: false,
  activeIndex: 0,
  round: 1,
  compact: false,
  compactSize: "medium",
  followView: false,
  overlayIds: [],
  collapsed: false,
  entries: [],
};

const app = document.querySelector("#app");
const scrollPositions = { edit: 0, compact: 0 };
let renderedMode = null;
let renderedTurn = null;
let lastActionHeight = null;
let cameraRequest = 0;
let nameSaveTimer;
let compactResizeFrame = 0;

function scheduleCompactResize() {
  cancelAnimationFrame(compactResizeFrame);
  compactResizeFrame = requestAnimationFrame(() => {
    const shell = app.querySelector('.compact-shell');
    if (connectionStatus !== 'ready' || !state.running || !state.compact || !shell) return;
    // Measure intrinsic content, never the iframe/body height. This stays stable
    // when Owlbear changes the viewport and also handles wrapped mobile headers.
    resizeAction(Math.ceil(shell.getBoundingClientRect().height));
  });
}

if (typeof ResizeObserver !== 'undefined') {
  const compactResizeObserver = new ResizeObserver(scheduleCompactResize);
  compactResizeObserver.observe(app);
}

function turnIdentity() { return `${state.round}:${state.entries[state.activeIndex]?.id ?? ""}`; }

function finishRender(mode, focus) {
  bindEvents();
  const track = app.querySelector(mode === "compact" ? ".compact-track" : ".track");
  if (track) track.scrollLeft = scrollPositions[mode];
  if (focus) {
    const input = [...app.querySelectorAll("[data-field]")].find(el => el.dataset.id === focus.id && el.dataset.field === focus.field);
    if (input) {
      input.value = focus.value;
      input.focus({ preventScroll: true });
      if (typeof focus.start === "number" && typeof input.setSelectionRange === "function" && input.type !== "number") input.setSelectionRange(focus.start, focus.end);
    }
  }
  if (mode === "compact" && (renderedMode !== mode || renderedTurn !== turnIdentity())) requestAnimationFrame(scrollActiveCard);
  renderedMode = mode;
  renderedTurn = turnIdentity();
  if (mode === 'compact') scheduleCompactResize();
}

function render() {
  if (connectionStatus !== "ready") {
    app.innerHTML = `<section class="connection-panel"><img src="/logo.png" alt="" width="64" height="64"><h1>Encounter Tracker</h1><p role="status">${escapeHtml(connectionMessage)}</p><p class="connection-hint">${connectionStatus === 'outside' ? 'Open this extension from your Owlbear Rodeo room. This website is not a standalone tracker.' : 'Your saved encounter is not being cleared. Waiting for the room connection.'}</p>${connectionStatus !== 'outside' ? '<button class="primary" data-retry>Retry connection</button><button class="ghost" data-reload>Reload tracker only</button>' : ''}</section>`;
    app.querySelector('[data-retry]')?.addEventListener('click', () => { connectionAttempt = 0; connectTracker(); });
    app.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
    return;
  }
  const oldTrack = app.querySelector(renderedMode === "compact" ? ".compact-track" : ".track");
  if (oldTrack && renderedMode) scrollPositions[renderedMode] = oldTrack.scrollLeft;
  const focused = document.activeElement;
  const focus = focused?.dataset?.field ? { id: focused.dataset.id, field: focused.dataset.field, value: focused.value, start: focused.selectionStart, end: focused.selectionEnd } : null;
  if (!(state.running && state.compact)) resizeAction(560);
  if (state.running && state.compact) {
    app.innerHTML = compactMarkup();
    finishRender("compact", null);
    return;
  }
  app.innerHTML = `
    <section class="shell">
      <button class="edge-close" data-action="close" title="Close Encounter Tracker" aria-label="Close Encounter Tracker">×</button>
      <header class="topbar">
        <div>
          <div class="brand-lockup">
            <img class="brand-logo" src="/logo.png" alt="Encounter Tracker logo" />
            <div>
              <div class="eyebrow">THE BATTLE CHRONICLE</div>
              <h1>Encounter Tracker</h1>
              <div class="creator-credit">By CorgiTheCat</div>
            </div>
          </div>
        </div>
        <div class="top-actions">
          <button class="sync-toggle ${state.followView ? "enabled" : ""}" data-action="toggle-follow" title="${state.followView ? "Disable camera sync" : "Enable camera sync"}" aria-label="Toggle camera sync">👁</button>
          ${controlsReady && localRole === "GM" ? '<button class="ghost" data-action="sort">Sort Initiative</button>' : ""}
          ${state.running && !state.compact ? '<button class="ghost" data-action="compact">Back to Encounter Bar</button>' : ""}
          ${state.running && canAdvanceCombat() ? '<button class="next" data-action="next" title="Next combatant">Next  ›</button>' : ""}
          ${!state.running || canAdvanceCombat() ? `<button class="primary" data-action="run">${state.running ? "Stop Encounter" : "Start Encounter"}</button>` : ''}
        </div>
      </header>
      <div class="status-row">
        <div class="encounter-status">
        <span class="live-dot ${state.running ? "on" : ""}"></span>
        ${state.running ? encounterStatusMarkup() : '<span>Prepare your encounter</span>'}
        </div>
        <div class="asset-actions">${turnControlsMarkup()}<button class="link" data-action="pick-assets">＋ Add from Assets</button>
        ${controlsReady && localRole === "GM" ? '<button class="link danger-link" data-action="clear-open">Clear all combatants</button>' : ''}
        </div>
      </div>
      <div class="roster-heading"><h2>Combatants</h2><span>${state.entries.length} in the encounter</span></div>
      ${!state.entries.length ? '<div class="empty-roster"><strong>Your next adventure starts here.</strong><p>Add characters from your Assets, or select Tokens on the Scene and choose Add to Encounter.</p></div>' : ''}
      <div class="track ${state.collapsed ? "hidden" : ""}">
        ${state.entries.map((entry, index) => card(entry, index)).join("")}
        <button class="add-card" data-action="add">＋<span>Add combatant</span></button>
      </div>
      <footer class="footer">
        <span>Shared with your party · Saved to this room's Scene</span>
      </footer>
    </section>`;
  finishRender("edit", focus);
}

async function resizeAction(height) {
  if (!OBR?.isAvailable || !OBR.action?.setHeight) return;
  if (height === lastActionHeight) return;
  lastActionHeight = height;
  try {
    // Do not calculate from window.innerWidth/innerHeight here. Owlbear changes
    // the iframe viewport after resizing, which would otherwise shrink it again
    // every time render() runs.
    if (OBR.action.setWidth) await OBR.action.setWidth(760);
    await OBR.action.setHeight(Math.max(120, height));
  } catch (error) { lastActionHeight = null; console.warn("Could not resize encounter action", error); }
}

function compactMarkup() {
  return `<section class="compact-shell">
    <div class="compact-head">
      <span class="compact-title"><img class="compact-logo" src="/logo.png" alt="" />${encounterStatusMarkup()}</span>
      <div class="compact-actions">
        <label class="size-control">Size
          <select data-size>
            <option value="small" ${state.compactSize === "small" ? "selected" : ""}>S</option>
            <option value="medium" ${state.compactSize === "medium" ? "selected" : ""}>M</option>
            <option value="large" ${state.compactSize === "large" ? "selected" : ""}>L</option>
          </select>
        </label>
        <button class="sync-toggle ${state.followView ? "enabled" : ""}" data-action="toggle-follow" title="${state.followView ? "Disable camera sync" : "Enable camera sync"}" aria-label="Toggle camera sync">👁</button>
        <button class="compact-icon" data-action="expand" title="Open manager">⚙</button>
        ${canAdvanceCombat() ? '<button class="compact-next" data-action="next" title="Next combatant">›</button>' : ""}
        <button class="edge-close compact-close" data-action="close" title="Close Encounter Tracker" aria-label="Close Encounter Tracker">×</button>
      </div>
    </div>
    <div class="compact-track">
      ${state.entries.map((entry, index) => {
        return `<button class="compact-card ${index === state.activeIndex ? "current" : ""} ${entry.type}" ${canAdvanceCombat() ? 'data-action="jump"' : 'aria-disabled="true"'} data-index="${index}" title="${escapeHtml(entry.name)}">
          <span class="compact-portrait ${entry.dead || entry.unknown ? 'is-dead' : ''}"><img src="${entry.image}" alt="${escapeHtml(entry.name)}" />${entryStatusBanner(entry)}</span>
          <span class="compact-name">${escapeHtml(entry.name)}</span>
        </button>`;
      }).join("")}
    </div>
  </section>`;
}

function encounterStatusMarkup() {
  return `<span class="encounter-metric"><small>Round</small><b>${state.round}</b></span><span class="encounter-metric"><small>Turn</small><b>${state.entries.length ? state.activeIndex + 1 : 0}/${state.entries.length}</b></span><span class="encounter-metric"><small>Time</small><b>${encounterTimeLabel(state.round)}</b></span>`;
}

function isPlayer(entry) { return entry.type === "player" || entry.type === "ผู้เล่น" || entry.type === "PLAYER"; }

function entryStatusBanner(entry) {
  if (entry.dead) return '<span class="dead-banner">DEAD</span>';
  if (entry.unknown) return '<span class="dead-banner unknown-banner">UNKNOW</span>';
  return '';
}

function richTextToPlainText(nodes) {
  if (!Array.isArray(nodes)) return "";
  return nodes.map((node) => {
    if (typeof node?.text === "string") return node.text;
    return richTextToPlainText(node?.children);
  }).join("");
}

function sceneItemName(item, fallback = "Combatant") {
  const plainText = item?.text?.plainText?.trim();
  if (plainText) return plainText;
  const richText = richTextToPlainText(item?.text?.richText).trim();
  if (richText) return richText;
  return item?.name?.trim() || fallback;
}

function encounterTimeLabel(round) {
  const seconds = Math.max(0, Number(round || 1) * 6);
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} minute${seconds / 60 === 1 ? "" : "s"}`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

async function syncToActiveEntry() {
  const request = ++cameraRequest;
  if (!state.followView || !OBR?.isAvailable || !OBR.viewport?.animateToBounds) return;
  const entry = state.entries[state.activeIndex];
  // Asset-only combatants have no Scene Token to follow. Skip them without
  // changing the current viewport; the next Token-backed turn can still sync.
  if (!canFollowEntry(entry) || !entry?.sourceItemId || !OBR.scene?.items?.getItemBounds) return;
  try {
    const items = await OBR.scene.items.getItems([entry.sourceItemId]);
    if (!items.length || request !== cameraRequest) return;
    const bounds = await OBR.scene.items.getItemBounds([entry.sourceItemId]);
    const currentEntry = state.entries[state.activeIndex];
    if (bounds && request === cameraRequest && state.followView &&
        currentEntry?.id === entry.id && canFollowEntry(currentEntry)) {
      // Leave room around the Token so the player can still see nearby terrain.
      const contextScale = 12;
      const width = Math.max(bounds.width * contextScale, 1);
      const height = Math.max(bounds.height * contextScale, 1);
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const paddedBounds = {
        min: { x: bounds.center.x - halfWidth, y: bounds.center.y - halfHeight },
        max: { x: bounds.center.x + halfWidth, y: bounds.center.y + halfHeight },
        width,
        height,
        center: bounds.center,
      };
      await OBR.viewport.animateToBounds(paddedBounds);
    }
  } catch (error) {
    console.warn("Could not sync viewport to active combatant", error);
  }
}

function canFollowEntry(entry) {
  return Boolean(entry) && !entry.dead && (!entry.unknown || localRole === 'GM');
}

function scrollActiveCard() {
  const track = app.querySelector(".compact-track");
  const card = app.querySelector(".compact-card.current");
  if (!track || !card) return;
  const target = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
  track.scrollTo({ left: Math.max(0, target), behavior: "auto" });
}

function card(entry, index) {
  return `<article class="card ${entry.type} ${state.running && index === state.activeIndex ? "active" : ""}">
    <div class="card-tools">
      <button class="tiny" data-action="remove" data-id="${entry.id}" title="Remove">×</button>
    </div>
    <label class="portrait ${entry.dead || entry.unknown ? 'is-dead' : ''}" data-action="pick-entry-asset" data-id="${entry.id}">
      <img src="${entry.image}" alt="${escapeHtml(entry.name)}" />
      ${entryStatusBanner(entry)}
        <span class="image-hint">Change from Asset</span>
    </label>
    <label class="name-label">Name<input class="name" data-field="name" data-id="${entry.id}" value="${escapeHtml(entry.name)}" aria-label="Name" title="Edit name · Enter or click outside to save" /></label>
    <div class="meta-labels" aria-hidden="true"><span>Initiative</span><span>Side</span></div>
    <div class="meta">
      <input class="initiative" type="number" min="0" data-field="initiative" data-id="${entry.id}" value="${entry.initiative}" aria-label="Initiative" />
      <select data-field="type" data-id="${entry.id}" aria-label="Type">
        <option value="player" ${isPlayer(entry) ? "selected" : ""}>Player</option>
        <option value="enemy" ${entry.type === "enemy" ? "selected" : ""}>Monster</option>
      </select>
    </div>
    <button class="life-toggle ${entry.dead ? 'is-dead' : ''}" data-action="toggle-dead" data-id="${entry.id}" aria-pressed="${Boolean(entry.dead)}" aria-label="${entry.dead ? 'Revive' : 'Mark dead'}: ${escapeHtml(entry.name)}">${entry.dead ? '↶ Revive' : 'Mark dead'}</button>
    <button class="life-toggle unknown-toggle ${entry.unknown ? 'is-unknown' : ''}" data-action="toggle-unknown" data-id="${entry.id}" aria-pressed="${Boolean(entry.unknown)}" aria-label="${entry.unknown ? 'Reveal' : 'Mark Unknow'}: ${escapeHtml(entry.name)}">${entry.unknown ? '↶ Reveal' : 'Mark Unknow'}</button>
  </article>`;
}

function bindEvents() {
  app.querySelectorAll("[data-player-turns]").forEach((el) => el.addEventListener("change", (event) => {
    setPlayerTurns(event.currentTarget.checked);
  }));
  app.querySelectorAll("[data-size]").forEach((el) => el.addEventListener("change", (event) => {
    state.compactSize = event.target.value;
    render();
  }));
  app.querySelectorAll('[data-field="name"]').forEach(el => el.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
  }));
  app.querySelectorAll('[data-field="name"]').forEach(el => el.addEventListener('input', event => {
    const entry = state.entries.find(item => item.id === event.currentTarget.dataset.id);
    const name = event.currentTarget.value.trim();
    if (!entry || !name) return;
    // Update before any render can remove this input. change/blur alone is not
    // reliable when switching modes or receiving a shared-state refresh.
    entry.name = name;
    entry.nameOverride = true;
    clearTimeout(nameSaveTimer);
    nameSaveTimer = setTimeout(() => { nameSaveTimer = null; persist(); }, 250);
  }));
  app.querySelectorAll("[data-field]").forEach((el) => el.addEventListener("change", async (event) => {
    const item = state.entries.find((x) => x.id === event.target.dataset.id);
    if (!item) return;
    if (event.target.dataset.field === 'name') {
      clearTimeout(nameSaveTimer); nameSaveTimer = null;
      const name = event.target.value.trim();
      if (!name) { event.target.value = item.name; return; }
      item.name = name;
      item.nameOverride = true;
      event.target.value = name;
      // Old saved entries may lack a source-name snapshot. Read it once without
      // changing the Scene Token, so unrelated Scene edits cannot reset a rename.
      if (item.sourceItemId && item.sourceName === undefined && OBR?.scene?.items?.getItems) {
        try {
          const [source] = await OBR.scene.items.getItems([item.sourceItemId]);
          if (source && item.name === name) item.sourceName = sceneItemName(source);
        } catch (error) { console.warn('Could not read source Token name', error); }
      }
      await persist();
      return;
    }
    const numericFields = new Set(["initiative", "hp", "maxHp", "ac"]);
    item[event.target.dataset.field] = numericFields.has(event.target.dataset.field) ? Number(event.target.value) : event.target.value;
    persist();
    // Keep the current input and horizontal scroll in place while editing.
  }));
  app.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", async (event) => {
    const action = event.currentTarget.dataset.action;
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer); nameSaveTimer = null;
      await persist();
    }
    if (action === "toggle-dead" || action === "toggle-unknown") {
      const entry = state.entries.find((item) => item.id === event.currentTarget.dataset.id);
      if (!entry) return;
      const field = action === 'toggle-dead' ? 'dead' : 'unknown';
      entry[field] = !entry[field];
      // A combatant has one manual status: Dead or Unknow, not both.
      if (entry[field]) entry[field === 'dead' ? 'unknown' : 'dead'] = false;
      if (state.entries[state.activeIndex]?.id === entry.id) cameraRequest++;
      await persist();
      render();
      return;
    }
    if (["next", "jump"].includes(action) && !canAdvanceCombat()) return;
    if (["sort", "clear-open"].includes(action) && (!controlsReady || localRole !== "GM")) return;
    if (action === "clear-open") { openClearDialog(); return; }
    if (action === "run") {
      if (state.running && !canAdvanceCombat()) return;
      state.running = !state.running;
      state.compact = state.running;
      render();
      if (state.running) setTimeout(syncToActiveEntry, 0);
    }
    if (action === "next") {
      if (!state.entries.length) return;
      if (state.activeIndex === state.entries.length - 1) state.round += 1;
      state.activeIndex = (state.activeIndex + 1) % state.entries.length;
      persist(); render();
      syncToActiveEntry();
    }
    if (action === "close") { await OBR?.action?.close?.(); return; }
    if (action === "toggle-follow") { state.followView = !state.followView; render(); if (state.followView) syncToActiveEntry(); return; }
    if (action === "expand") { state.compact = false; render(); }
    if (action === "compact") { state.compact = true; render(); }
    if (action === "jump") { state.activeIndex = Number(event.currentTarget.dataset.index); persist(); render(); syncToActiveEntry(); }
    if (action === "sort") { state.entries.sort((a, b) => Number(b.initiative) - Number(a.initiative)); state.activeIndex = 0; persist(); render(); }
    if (action === "remove") {
      const activeId = state.entries[state.activeIndex]?.id;
      state.entries = state.entries.filter((x) => x.id !== event.currentTarget.dataset.id);
      const retained = state.entries.findIndex(entry => entry.id === activeId);
      state.activeIndex = retained >= 0 ? retained : Math.max(0, Math.min(state.activeIndex, state.entries.length - 1));
      persist(); render();
    }
    if (action === "add") await pickAssets();
    if (action === "pick-entry-asset") await pickEntryAsset(event.currentTarget.dataset.id);
    if (action === "pick-assets") await pickAssets();
  }));
}

function openClearDialog() {
  if (app.querySelector(".clear-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.className = "clear-dialog";
  dialog.innerHTML = '<h2>Clear this encounter?</h2><p>Remove all combatants from the shared tracker for everyone. Scene Tokens and Assets will not be deleted.</p><div><button class="ghost" data-cancel>Cancel</button><button class="primary" data-clear>Clear all combatants</button></div>';
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.querySelector("[data-clear]").onclick = async () => {
    if (!controlsReady || localRole !== "GM") { dialog.close(); return; }
    state.entries = []; state.activeIndex = 0; state.round = 1;
    scrollPositions.edit = 0; scrollPositions.compact = 0;
    dialog.close(); render(); await persist();
  };
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  app.append(dialog); dialog.showModal(); dialog.querySelector("[data-cancel]").focus();
}

async function pickEntryAsset(id) {
  await OBRReady;
  if (!OBR?.isAvailable || !downloadImages) return alert("Asset Picker is not ready yet.");
  try {
    const downloads = await downloadImages(false, undefined, "CHARACTER");
    const selected = downloads?.[0];
    const selectedImage = selected?.image ?? selected;
    if (!selectedImage?.url) return;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;
    entry.image = selectedImage.url;
    entry.mime = selectedImage.mime;
    entry.imageOverride = true;
    await persist();
    render();
  } catch (error) { alert(`Could not change the Asset image: ${error?.message ?? error}`); }
}

async function pickAssets() {
  await OBRReady;
  if (!OBR?.isAvailable || !downloadImages) return alert("This button works when the extension is opened inside Owlbear Rodeo.");
  try {
    const downloads = await downloadImages(true, undefined, "CHARACTER");
    if (!downloads?.length) return;
    const additions = downloads.map((download, index) => ({
      id: crypto.randomUUID(),
      name: download.name || `Combatant ${state.entries.length + index + 1}`,
      initiative: 0,
      type: "enemy",
      hp: 1,
      maxHp: 1,
      ac: 10,
      image: download.image.url,
      mime: download.image.mime,
    }));
    state.entries = [...state.entries, ...additions];
    await persist();
    render();
  } catch (error) {
    console.error(error);
    alert(`Could not select images from Assets: ${error?.message ?? error}`);
  }
}

async function persist() {
  if (!OBR?.isAvailable || connectionStatus !== "ready") return;
  // Encounter data is shared, but each player's window mode is local.
  const shared = {
    entries: structuredClone(state.entries),
    activeIndex: state.activeIndex,
    round: state.round,
    overlayIds: state.overlayIds,
    updatedAt: Math.max(Date.now(), lastAppliedUpdate + 1),
  };
  lastAppliedUpdate = shared.updatedAt;
  persistQueue = persistQueue.then(async () => {
    await OBR.scene.setMetadata({ [KEY]: shared });
    if (OBR.room) await OBR.room.setMetadata({ [ROOM_KEY]: shared });
  }).catch((error) => console.warn("Could not save encounter", error));
  return persistQueue;
}

function latestSavedState(sceneMetadata, roomMetadata) {
  const candidates = [sceneMetadata?.[KEY], roomMetadata?.[ROOM_KEY]].filter((value) => value?.entries);
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0];
}

function isNewerSavedState(savedState) {
  return Array.isArray(savedState?.entries) && Number(savedState.updatedAt ?? 0) > lastAppliedUpdate;
}

function applyRemoteState(saved) {
  if (!isNewerSavedState(saved)) return;
  const previousTurn = turnIdentity();
  lastAppliedUpdate = Number(saved.updatedAt);
  // Incoming entries already contain shared portraits; no Scene fetch per turn.
  state.entries = saved.entries;
  state.activeIndex = Math.max(0, Math.min(Number(saved.activeIndex) || 0, state.entries.length - 1));
  state.round = Math.max(1, Number(saved.round) || 1);
  state.overlayIds = saved.overlayIds ?? [];
  render();
  if (state.followView && state.running && previousTurn !== turnIdentity()) syncToActiveEntry();
}

async function clearSceneOverlay() {
  if (!OBR?.isAvailable) return;
  const ids = [...(state.overlayIds ?? []), state.overlayId].filter(Boolean);
  if (!ids.length) return;
  try {
    await OBR.scene.items.deleteItems(ids);
    state.overlayIds = [];
    state.overlayId = undefined;
    await persist();
  } catch (error) { console.warn("Could not remove old encounter overlay", error); }
}

async function syncSceneOverlay() {
  if (!OBR?.isAvailable || !buildImage || !state.entries.length) return;
  try {
    const oldIds = [...(state.overlayIds ?? []), state.overlayId].filter(Boolean);
    if (oldIds.length) await OBR.scene.items.deleteItems(oldIds);
    const viewportScale = await OBR.viewport.getScale();
    const viewportWidth = await OBR.viewport.getWidth();
    const viewportHeight = await OBR.viewport.getHeight();
    const center = await OBR.viewport.inverseTransformPoint({ x: viewportWidth / 2, y: viewportHeight / 2 });
    const spacing = Math.max(170, Math.min(240, (viewportWidth / viewportScale) / Math.max(4, state.entries.length)));
    const items = state.entries.map((entry, index) => {
      const itemSize = 150;
      return buildImage(
        { width: itemSize, height: itemSize, url: entry.image, mime: entry.mime || (entry.image.startsWith("data:image/png") ? "image/png" : "image/jpeg") },
        { dpi: itemSize, offset: { x: itemSize / 2, y: itemSize / 2 } },
      )
        .position({ x: center.x + (index - (state.entries.length - 1) / 2) * spacing, y: center.y })
        .layer("NOTE")
        .locked(true)
        .disableHit(true)
        .metadata({ [KEY]: { encounterOverlay: true, encounterIndex: index } })
        .build();
    });
    await OBR.scene.items.addItems(items);
    state.overlayIds = items.map((item) => item.id);
    const shared = { entries: state.entries, running: state.running, activeIndex: state.activeIndex, round: state.round, overlayIds: state.overlayIds };
    await OBR.scene.setMetadata({ [KEY]: shared });
    if (OBR.room) await OBR.room.setMetadata({ [ROOM_KEY]: shared });
  } catch (error) {
    console.warn("Could not place encounter overlay in scene", error);
  }
}

async function createEncounterStrip() {
  const count = state.entries.length;
  const cardWidth = count > 8 ? 135 : count > 5 ? 155 : 180;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(420, count * cardWidth);
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const images = await Promise.all(state.entries.map((entry) => loadImage(entry.image)));
  state.entries.forEach((entry, index) => {
    const x = index * cardWidth + cardWidth / 2;
    const y = 106;
    const radius = Math.min(72, cardWidth * 0.37);
    const active = state.running && index === state.activeIndex;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, radius + (active ? 8 : 4), 0, Math.PI * 2);
    ctx.strokeStyle = entry.type === "player" ? "#46c98d" : "#f47777";
    ctx.lineWidth = active ? 8 : 5;
    ctx.shadowColor = active ? "#8ee6c0" : "transparent"; ctx.shadowBlur = active ? 20 : 0; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
    if (images[index]) ctx.drawImage(images[index], x - radius, y - radius, radius * 2, radius * 2);
    else { ctx.fillStyle = "#202b40"; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
    ctx.restore();
    ctx.fillStyle = "rgba(8, 13, 24, .78)"; ctx.fillRect(x - radius, y + radius - 23, radius * 2, 23);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(entry.name.slice(0, 18), x, y + radius - 7);
    ctx.fillStyle = "#dbe7f5"; ctx.font = "bold 13px sans-serif"; ctx.fillText(String(entry.initiative), x, y - radius - 12);
  });
  return canvas.toDataURL("image/png");
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function hydrateEntries(entries) {
  const ids = entries.map((entry) => entry.sourceItemId).filter(Boolean);
  if (!OBR?.isAvailable || !ids.length) return entries;
  try {
    const items = await OBR.scene.items.getItems(ids);
    const byId = new Map(items.filter(isImage).map((item) => [item.id, item]));
    return entries.map((entry) => {
      const source = byId.get(entry.sourceItemId);
      return source && !entry.imageOverride ? { ...entry, image: source.image.url, mime: source.image.mime } : entry;
    });
  } catch (error) {
    console.warn("Could not hydrate encounter images", error);
    return entries;
  }
}

async function addSceneItemToEncounter(item) {
  if (!item?.image?.url) {
    alert("Please select an image Token on the Scene first.");
    return;
  }
  const exists = state.entries.some((entry) => entry.sourceItemId === item.id);
  if (exists) return;
  state.entries.push({
    sourceItemId: item.id,
    id: item.id,
    name: sceneItemName(item),
    sourceName: sceneItemName(item),
    initiative: 0,
    type: "enemy",
    image: item.image.url,
    mime: item.image.mime,
  });
  await persist();
  render();
}

async function addSceneItemsToEncounter(items) {
  const selectedItems = (items ?? []).filter((item) => isImage(item) && item.image?.url);
  if (!selectedItems.length) {
    alert("Please select one or more image Tokens on the Scene first.");
    return;
  }
  const existingIds = new Set(state.entries.map((entry) => entry.sourceItemId).filter(Boolean));
  const additions = selectedItems
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({
      sourceItemId: item.id,
      id: item.id,
      name: sceneItemName(item),
      sourceName: sceneItemName(item),
      initiative: 0,
      type: "enemy",
      image: item.image.url,
      mime: item.image.mime,
    }));
  if (!additions.length) return;
  state.entries.push(...additions);
  await persist();
  render();
}

async function registerContextMenu() {
  if (contextMenuReady || !OBR?.contextMenu) return;
  await OBR.contextMenu.create({
    id: "com.local.encounter-tracker/add-to-encounter",
    icons: [{
      icon: "/logo.png",
      label: "Add to Encounter",
      filter: { every: [{ key: "type", value: "IMAGE" }] },
    }],
    onClick: async (context) => {
      if (connectionStatus !== "ready") return;
      await addSceneItemsToEncounter(context.items);
    },
  });
  contextMenuReady = true;
}

async function syncEntryImages(items) {
  const byId = new Map((items ?? []).map((item) => [item.id, item]));
  let changed = false;
  for (const entry of state.entries) {
    const source = entry.sourceItemId ? byId.get(entry.sourceItemId) : undefined;
    if (!entry.imageOverride && source?.image?.url && source.image.url !== entry.image) {
      entry.image = source.image.url;
      entry.mime = source.image.mime;
      changed = true;
    }
    if (source) {
      const nextName = sceneItemName(source);
      const sourceRenamed = entry.sourceName !== undefined && entry.sourceName !== nextName;
      if ((!entry.nameOverride || sourceRenamed) && nextName !== entry.name) {
        entry.name = nextName;
        changed = true;
      }
      if (sourceRenamed) entry.nameOverride = false;
      if (entry.sourceName !== nextName) { entry.sourceName = nextName; changed = true; }
    }
  }
  if (changed) { render(); await persist(); }
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

function disconnectSceneListeners() {
  for (const unsubscribe of sceneSubscriptions) unsubscribe();
  sceneSubscriptions = [];
}

function installLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  // Subscribe before the first isReady/getMetadata request: no missed ready edge.
  OBR.scene.onReadyChange(ready => {
    ++connectionGeneration;
    clearTimeout(connectionTimer);
    disconnectSceneListeners();
    controlsReady = false;
    connectionAttempt = 0;
    if (ready) connectTracker();
    else {
      connectionStatus = 'waiting';
      connectionMessage = 'Waiting for a Scene. Open a Scene in Owlbear to continue.';
      render();
    }
  });
  OBR.player.onChange(player => {
    if (localRole === player.role && localPlayerId === player.id) return;
    localRole = player.role; localPlayerId = player.id; render();
  });
  OBR.room.onMetadataChange(metadata => {
    const before = allowPlayerTurns;
    applyTurnControls(metadata);
    if (before !== allowPlayerTurns) render();
  });
}

function connectionFailed(generation, error) {
  if (generation !== connectionGeneration) return;
  ++connectionGeneration; // Discard late responses from the failed attempt.
  clearTimeout(connectionTimer);
  cancelReadyWait?.();
  disconnectSceneListeners();
  controlsReady = false;
  console.warn('Encounter connection failed', error);
  connectionStatus = 'error';
  const retry = connectionAttempt < 3;
  connectionMessage = retry ? `Connection interrupted. Retrying (${connectionAttempt}/3)…` : 'Could not connect to Owlbear. Try again or reload this tracker only.';
  render();
  if (retry) connectionTimer = setTimeout(() => connectTracker(), 1500 * connectionAttempt);
}

async function connectTracker() {
  clearTimeout(connectionTimer);
  const generation = ++connectionGeneration;
  cancelReadyWait?.();
  ++connectionAttempt;
  disconnectSceneListeners();
  controlsReady = false;
  connectionStatus = 'connecting';
  connectionMessage = `Connecting to Owlbear… (${connectionAttempt}/3)`;
  render();
  connectionTimer = setTimeout(() => connectionFailed(generation, new Error('Connection timed out')), 12000);
  try {
    if (!OBR) {
      sdkImport ??= import(`./vendor/owlbear-sdk.js?attempt=${++sdkLoadAttempt}`).catch(error => { sdkImport = undefined; throw error; });
      const sdk = await sdkImport;
      if (generation !== connectionGeneration) return;
      OBR = sdk.default;
      isImage = sdk.isImage ?? (item => item?.type === 'IMAGE');
      buildImage = sdk.buildImage;
      downloadImages = (...args) => OBR.assets.downloadImages(...args);
    }
    if (!OBR.isAvailable) {
      clearTimeout(connectionTimer);
      connectionStatus = 'outside';
      connectionMessage = 'Open Encounter Tracker inside Owlbear Rodeo';
      render(); return;
    }
    if (!OBR.isReady) {
      let unsubscribe;
      let disposed = false;
      let cancel;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        unsubscribe?.();
        if (cancelReadyWait === cancel) cancelReadyWait = undefined;
      };
      await new Promise((resolve, reject) => {
        cancel = () => { dispose(); reject(new Error('Connection attempt replaced')); };
        cancelReadyWait = cancel;
        unsubscribe = OBR.onReady(resolve);
        if (OBR.isReady) resolve();
      }).finally(dispose);
      if (generation !== connectionGeneration) return;
    }
    resolveOBRReady();
    installLifecycle();
    if (!(await OBR.scene.isReady())) {
      if (generation !== connectionGeneration) return;
      clearTimeout(connectionTimer);
      connectionStatus = 'waiting';
      connectionMessage = 'Waiting for a Scene. Open a Scene in Owlbear to continue.';
      render(); return;
    }
    const [role, metadata, roomMetadata] = await Promise.all([OBR.player.getRole(), OBR.scene.getMetadata(), OBR.room.getMetadata()]);
    if (generation !== connectionGeneration) return;
    // Read the existing saved data without writing an empty initial encounter.
    const saved = latestSavedState(metadata, roomMetadata);
    const entries = saved ? await hydrateEntries(saved.entries) : [];
    if (generation !== connectionGeneration) return;
    await registerContextMenu();
    if (generation !== connectionGeneration) return;
    localRole = role; localPlayerId = OBR.player.id;
    applyTurnControls(roomMetadata);
    state.entries = entries;
    state.activeIndex = Math.max(0, Math.min(Number(saved?.activeIndex) || 0, entries.length - 1));
    state.round = Math.max(1, Number(saved?.round) || 1);
    state.overlayIds = saved?.overlayIds ?? [];
    lastAppliedUpdate = Number(saved?.updatedAt ?? 0);
    sceneSubscriptions.push(OBR.scene.items.onChange(syncEntryImages));
    sceneSubscriptions.push(OBR.scene.onMetadataChange(value => applyRemoteState(value[KEY])));
    sceneSubscriptions.push(OBR.room.onMetadataChange(value => applyRemoteState(value[ROOM_KEY])));
    // Reconcile changes made by another player while the initial fetch was pending.
    const latest = await OBR.scene.getMetadata();
    if (generation !== connectionGeneration) return;
    applyRemoteState(latest[KEY]);
    clearTimeout(connectionTimer);
    controlsReady = true; connectionStatus = 'ready'; connectionAttempt = 0;
    render();
  } catch (error) { connectionFailed(generation, error); }
}

// Startup is intentionally separate from UI code so it can be tested offline.
render();
connectTracker();
