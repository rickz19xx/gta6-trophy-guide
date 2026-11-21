// provenance: recorded build 2026-11-21
const KEY = 'leonida-ledger/v1';
const GR = { platinum: 'P', gold: 'G', silver: 'S', bronze: 'B' };
const PAGES = ['tracker', 'roadmap', 'about'];
const CATS = ['all', 'story', 'missable', 'collectible', 'activity', 'side'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : String(kid));
  }
  return n;
}

const els = {
  totals: $('#totals'), bar: $('#bar'), list: $('#list'), detail: $('#detail'),
  shown: $('#shown'), hint: $('#hint'), sub: $('#sub'), q: $('#q'), grade: $('#grade'),
  missing: $('#missing'), clear: $('#clear'), cats: $('#cats'), help: $('#help'),
  helpBtn: $('#helpBtn'), toast: $('#toast'), spoiler: $('#spoilerBtn'),
  demoTag: $('#demoTag'), demoBtn: $('#demoBtn'), importFile: $('#importFile'),
  tabs: $$('.tab'), foot: $('#footState'), tabCount: $('#tabCount'),
  views: { tracker: $('#view-tracker'), roadmap: $('#view-roadmap'), about: $('#view-about') },
};

/* the sticky rail and detail need the real header height, which changes when the bar wraps */
const headerBar = $('.bar');
function syncHeaderHeight() {
  if (!headerBar) return;
  const h = Math.ceil(headerBar.getBoundingClientRect().height);
  if (h) document.documentElement.style.setProperty('--bar-h', `${h}px`);
}
syncHeaderHeight();
function resyncHeader() {
  syncHeaderHeight();
  setTimeout(syncHeaderHeight, 120);
  setTimeout(syncHeaderHeight, 600);
}
window.addEventListener('resize', resyncHeader);
window.addEventListener('orientationchange', resyncHeader);
window.addEventListener('pageshow', syncHeaderHeight);
if ('ResizeObserver' in window) new ResizeObserver(syncHeaderHeight).observe(headerBar);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const DEF = () => ({ v: 1, earned: {}, counts: {}, ui: {
  view: 'tracker', cat: 'all', grade: 'all', q: '', missing: false,
  spoiler: false, lastTrophy: null } });

function readSave() {
  const s = DEF();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || p.v !== 1) return s;
    if (p.earned && typeof p.earned === 'object') {
      for (const [id, v] of Object.entries(p.earned)) if (v === true) s.earned[id] = true;
    }
    if (p.counts && typeof p.counts === 'object') {
      for (const [id, v] of Object.entries(p.counts)) {
        if (Number.isFinite(v)) s.counts[id] = Math.max(0, Math.floor(v));
      }
    }
    if (p.ui && typeof p.ui === 'object') {
      const u = p.ui;
      if (PAGES.includes(u.view)) s.ui.view = u.view;
      if (CATS.includes(u.cat)) s.ui.cat = u.cat;
      if (['all', 'platinum', 'gold', 'silver', 'bronze'].includes(u.grade)) s.ui.grade = u.grade;
      if (typeof u.q === 'string') s.ui.q = u.q.slice(0, 80);
      s.ui.missing = u.missing === true;
      s.ui.spoiler = u.spoiler === true;
      if (typeof u.lastTrophy === 'string') s.ui.lastTrophy = u.lastTrophy;
    }
  } catch { return DEF(); }
  return s;
}

let REAL = readSave();
let S = REAL;
let DEMO = false;
let DATA = [];
let BY = new Map();
let revealed = new Set();
let resetTimer = 0;

function persist() {
  if (DEMO) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage full or blocked */ }
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove('on'), 2800);
}

/* ---------- derived state ---------- */
const countOf = (t) => (t.count ? Math.min(S.counts[t.id] ?? 0, t.count) : 0);
const isEarned = (t) => (t.grade === 'platinum'
  ? S.earned[t.id] === true || (DATA.length > 1 && DATA.every((x) => x.grade === 'platinum' || S.earned[x.id] === true))
  : S.earned[t.id] === true);
const locked = (t) => S.ui.spoiler && t.spoiler && !isEarned(t) && !revealed.has(t.id);
const nameOf = (t) => (locked(t) ? 'Hidden story trophy' : t.name);
const descOf = (t) => (locked(t) ? 'Story spoiler hidden. Open the trophy to reveal it.' : t.description);

function anyFilter() {
  return S.ui.cat !== 'all' || S.ui.grade !== 'all' || S.ui.q !== '' || S.ui.missing;
}

function matches(t) {
  const u = S.ui;
  if (u.cat === 'missable' && !t.missable) return false;
  if (u.cat !== 'all' && u.cat !== 'missable' && t.category !== u.cat) return false;
  if (u.grade !== 'all' && t.grade !== u.grade) return false;
  if (u.missing && isEarned(t)) return false;
  if (u.q) {
    const q = u.q.toLowerCase();
    const hay = `${t.name} ${t.description} ${t.guide} ${t.chapter || ''} ${t.mission || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const visible = () => DATA.filter(matches);
const stats = () => {
  const g = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  let e = 0;
  for (const t of DATA) if (isEarned(t)) { e++; g[t.grade]++; }
  return { e, g, pct: DATA.length ? Math.round((e / DATA.length) * 100) : 0 };
};

/* ---------- totals ---------- */
function renderTotals() {
  const n = DATA.length;
  const st = stats();
  const done = n > 0 && st.e === n;
  els.totals.classList.toggle('done', done);
  els.totals.replaceChildren(
    h('span', { class: 'stat' }, h('b', { text: `${st.e} / ${n}` }), ' earned'), ' ',
    h('span', { class: 'stat grade-stat', text: `${st.g.gold} gold` }), ' ',
    h('span', { class: 'stat grade-stat', text: `${st.g.silver} silver` }), ' ',
    h('span', { class: 'stat grade-stat', text: `${st.g.bronze} bronze` }), ' ',
    h('span', { class: 'stat', text: st.g.platinum ? 'platinum earned' : 'platinum locked' }), ' ',
    h('span', { class: `stat pct${st.pct ? '' : ' zero'}`, text: `${st.pct}%` }),
  );
  els.bar.style.width = `${st.pct}%`;
  els.bar.classList.toggle('glow', done);
  if (n) {
    els.tabCount.textContent = String(n);
    els.foot.textContent = DEMO
      ? `${st.e} of ${n} earned · demo save · not written`
      : `${st.e} of ${n} earned · saved locally · no tracking`;
  }
  syncHeaderHeight();
}

/* ---------- counters ---------- */
function setCount(t, next) {
  const max = t.count || 0;
  if (!max) return;
  const prev = countOf(t);
  const wasFull = prev >= max;
  const was = isEarned(t);
  const wasLocked = locked(t);
  const v = Math.max(0, Math.min(max, Math.floor(next)));
  if (v) S.counts[t.id] = v; else delete S.counts[t.id];
  if (v >= max) S.earned[t.id] = true;
  else if (wasFull) delete S.earned[t.id];
  persist();
  if (!was && isEarned(t)) toast(`${wasLocked ? 'Story trophy' : t.name} earned`);
}

function stepOf(t) {
  if (!t.count || t.count < 1000) return 1;
  return 10 ** Math.max(0, String(t.count).length - 3);
}

function fmtNum(n) { return Number(n).toLocaleString('en-US'); }

function syncCounts(t) {
  const v = countOf(t);
  $$(`[data-counter="${t.id}"]`).forEach((n) => { n.textContent = fmtNum(v); });
  $$(`[data-cbar="${t.id}"]`).forEach((n) => { n.style.width = `${(v / t.count) * 100}%`; });
  const row = $(`.row[data-id="${t.id}"]`);
  if (row) {
    row.classList.toggle('earned', isEarned(t));
    const box = $('.tick', row);
    if (box) box.checked = isEarned(t);
  }
  const dt = $('.d-tick', els.detail);
  if (dt && S.ui.lastTrophy === t.id) {
    const e = isEarned(t);
    dt.textContent = e ? 'Earned ✓' : 'Mark earned';
    dt.classList.toggle('on', e);
    dt.setAttribute('aria-pressed', String(e));
  }
}

function counterNode(t, scope) {
  const step = stepOf(t);
  const nudge = (dir, e) => {
    const was = isEarned(t);
    const hadDetailFocus = els.detail.contains(document.activeElement);
    const delta = dir * step * (dir > 0 && e.shiftKey ? 10 : 1);
    setCount(t, countOf(t) + delta);
    syncCounts(t);
    renderTotals();
    const changed = was !== isEarned(t);
    if (changed && (S.ui.missing || (t.spoiler && S.ui.spoiler))) renderList();
    if (S.ui.lastTrophy === t.id && changed) {
      renderDetail();
      if (hadDetailFocus) els.detail.querySelector('.d-tick')?.focus({ preventScroll: true });
    }
  };
  const minus = h('button', {
    type: 'button', 'aria-label': `Subtract ${fmtNum(step)} from ${nameOf(t)}`,
    onclick: (e) => nudge(-1, e),
  }, '−');
  const plus = h('button', {
    type: 'button', 'aria-label': `Add ${fmtNum(step)} to ${nameOf(t)}`,
    title: `Adds ${fmtNum(step)} · hold Shift for ${fmtNum(step * 10)}`,
    onclick: (e) => nudge(1, e),
  }, '+');
  const box = h('span', { class: 'counter' }, minus,
    h('span', {}, h('b', { 'data-counter': t.id, text: fmtNum(countOf(t)) }), `/${fmtNum(t.count)}`), plus);
  box.dataset.scope = scope;
  return box;
}

/* ---------- tracker list ---------- */
function rowNode(t) {
  const earned = isEarned(t);
  const tick = h('input', { class: 'tick', type: 'checkbox', 'aria-label': `Earned: ${nameOf(t)}` });
  tick.checked = earned;
  if (t.grade === 'platinum') {
    tick.disabled = true;
    tick.title = 'Unlocks when the other 54 are earned';
  }
  tick.addEventListener('change', () => setEarned(t.id, tick.checked));

  const open = h('button', { class: 'openrow', type: 'button', onclick: () => select(t.id) },
    h('span', { class: 'name', text: nameOf(t) }),
    h('span', { class: 'desc', text: descOf(t) }));

  const side = h('div', { class: 'side' });
  if (t.count) side.append(counterNode(t, 'row'));
  if (t.missable) side.append(h('span', { class: 'miss', text: 'Missable' }));
  side.append(h('span', { class: 'tag', text: t.grade === 'platinum' ? 'platinum' : t.category }));
  if (t.chapter && !locked(t)) {
    const short = t.chapter.replace('Chapter ', 'Ch. ');
    side.append(h('span', { class: 'chap', title: t.chapter, text: short.split(' — ')[0] }));
  }

  const li = h('li', {
    class: `row${earned ? ' earned' : ''}${S.ui.lastTrophy === t.id ? ' sel' : ''}`,
    'data-id': t.id,
  }, tick, h('span', {
    class: `gchip g-${t.grade}`, title: t.grade, 'aria-label': t.grade, text: GR[t.grade],
  }), open, side);

  li.addEventListener('click', (e) => {
    if (e.target.closest('button, input')) return;
    select(t.id);
  });
  return li;
}

function renderList() {
  const rows = visible();
  els.list.replaceChildren(...rows.map(rowNode));
  if (!rows.length) {
    els.list.append(h('li', { class: 'empty-row' }, 'Nothing matches those filters. ',
      h('button', { class: 'clear on', type: 'button', text: 'Clear filters', onclick: clearFilters })));
  }
  els.shown.textContent = `${rows.length} of ${DATA.length} shown`;
  els.clear.classList.toggle('on', anyFilter());
  els.hint.hidden = !(stats().e === 0 && !anyFilter() && !DEMO);
  els.sub.textContent = `${DATA.length} trophies · 1 platinum`;
}

/* ---------- detail ---------- */
function progressBlock(t) {
  const v = countOf(t);
  const label = (t.checklist && t.checklist[0] && t.checklist[0].label) || 'Progress';
  const bar = h('i', { 'data-cbar': t.id });
  bar.style.width = `${t.count ? (v / t.count) * 100 : 0}%`;
  return h('div', {},
    h('h3', { text: 'Progress' }),
    h('div', { class: 'prog' }, h('span', { text: label }),
      h('span', { style: 'margin-left:auto', 'aria-live': 'polite' },
        h('b', { 'data-counter': t.id, text: fmtNum(v) }), ` / ${fmtNum(t.count)}`)),
    h('div', { class: 'progbar' }, bar),
    counterNode(t, 'detail'));
}

function renderDetail() {
  const t = BY.get(S.ui.lastTrophy);
  const wasOpen = els.detail.classList.contains('open');
  const prevId = els.detail.dataset.trophy || '';
  const keepScroll = prevId === (t ? t.id : '') ? els.detail.scrollTop : 0;
  els.detail.className = `detail${wasOpen && t ? ' open' : ''}`;
  if (!t) {
    delete els.detail.dataset.trophy;
    els.detail.classList.add('empty');
    els.detail.replaceChildren('Pick a trophy to see the route, the steps and the sources behind it.');
    return;
  }
  els.detail.dataset.trophy = t.id;
  const close = h('button', {
    class: 'd-close', type: 'button', 'aria-label': 'Close detail',
    onclick: () => closeDetail(),
  }, '×');

  const head = h('div', { class: 'd-head' },
    h('h2', { text: nameOf(t) }),
    h('span', { class: `gchip g-${t.grade}`, title: t.grade, text: GR[t.grade] }),
    close);

  const metaBits = [t.grade];
  if (t.grade !== 'platinum') metaBits.push(t.category);
  if (!locked(t) && t.chapter) metaBits.push(t.chapter);
  if (!locked(t) && t.mission) metaBits.push(t.mission);
  const meta = h('div', { class: 'd-meta' }, metaBits.map((m) => h('span', { text: m })));

  const kids = [head, meta];
  if (t.missable) {
    kids.push(h('p', { class: 'warn' }, h('b', { text: 'Missable' }),
      locked(t) ? 'This one can close before you reach it. Reveal the trophy for the exact point.' : t.missableNote));
  }

  if (locked(t)) {
    kids.push(h('button', {
      class: 'reveal', type: 'button', text: 'Reveal (spoiler)',
      onclick: () => {
        revealed.add(t.id);
        renderAll();
        els.detail.querySelector('.d-tick')?.focus({ preventScroll: true });
      },
    }));
    els.detail.replaceChildren(...kids);
    els.detail.scrollTop = keepScroll;
    return;
  }

  kids.push(h('h3', { text: 'How to earn' }), h('p', { text: t.guide }));
  if (!locked(t)) {
    const earned = isEarned(t);
    const plat = t.grade === 'platinum';
    const tickBtn = h('button', {
      class: `d-tick${earned ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': String(earned),
      disabled: plat || undefined,
      title: plat ? 'Unlocks with the other 54 trophies' : 'Toggle from here without closing the panel',
      onclick: () => setEarned(t.id, !isEarned(t)),
    }, earned ? 'Earned ✓' : 'Mark earned');
    head.insertBefore(tickBtn, close);
  }
  if (t.steps && t.steps.length) {
    kids.push(h('h3', { text: 'Steps' }), h('ol', { class: 'steps' }, t.steps.map((s) => h('li', { text: s }))));
  }
  if (t.count) kids.push(progressBlock(t));
  if (t.sources && t.sources.length) {
    kids.push(h('h3', { text: 'Sources' }), h('ul', { class: 'srcs' },
      t.sources.map((s) => h('li', {},
        h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label }),
        h('span', { text: hostOf(s.url) })))));
  }
  if (t.description) {
    kids.push(h('div', { class: 'official' }, 'Official description',
      h('q', { text: t.description })));
  }
  els.detail.replaceChildren(...kids);
  els.detail.scrollTop = keepScroll;
}

const hostOf = (url) => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
};

function closeDetail() {
  const id = S.ui.lastTrophy;
  if (!id) {
    els.detail.classList.remove('open');
    return;
  }
  S.ui.lastTrophy = null;
  els.detail.classList.remove('open');
  persist();
  syncUrl();
  renderAll();
  if (window.matchMedia('(max-width: 999px)').matches) {
    const row = $(`.row[data-id="${id}"]`);
    row?.querySelector('.openrow')?.focus({ preventScroll: true });
  }
}

function select(id, opts = {}) {
  if (!BY.has(id)) return;
  S.ui.lastTrophy = id;
  $$('.row.sel').forEach((r) => r.classList.remove('sel'));
  const row = $(`.row[data-id="${id}"]`);
  if (row) {
    row.classList.add('sel');
    if (opts.scroll !== false) row.scrollIntoView({ block: 'nearest' });
  }
  const sheet = opts.sheet !== false && window.matchMedia('(max-width: 999px)').matches;
  if (sheet) {
    els.detail.classList.add('open');
  }
  renderDetail();
  if (sheet) els.detail.querySelector('.d-close')?.focus({ preventScroll: true });
  persist();
  syncUrl();
}

/* ---------- earned ---------- */
function setEarned(id, val) {
  const t = BY.get(id);
  if (!t) return;
  if (val && t.grade === 'platinum') {
    toast('The platinum unlocks with the other 54.');
    return;
  }
  const focused = document.activeElement;
  const focusRow = focused?.closest?.('.row');
  const focusSel = focused?.classList?.contains('tick') ? '.tick'
    : focused?.classList?.contains('openrow') ? '.openrow' : null;
  const focusId = focusSel && focusRow ? focusRow.dataset.id : null;
  const hadDetailFocus = els.detail.contains(focused);
  if (val) {
    S.earned[id] = true;
    if (t.count) S.counts[id] = t.count;
  } else {
    delete S.earned[id];
  }
  persist();
  renderAll();
  if (focusId) {
    $(`.row[data-id="${focusId}"]`)?.querySelector(focusSel)?.focus({ preventScroll: true });
  } else if (hadDetailFocus) {
    els.detail.querySelector('.d-tick')?.focus({ preventScroll: true });
  }
}

/* ---------- filters ---------- */
function setCat(cat) {
  if (!CATS.includes(cat)) return;
  S.ui.cat = cat;
  persist(); renderList(); syncFilters(); syncUrl();
}

function syncFilters() {
  $$('#cats .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === S.ui.cat)));
  els.grade.value = S.ui.grade;
  els.missing.checked = S.ui.missing;
  els.spoiler.setAttribute('aria-checked', String(S.ui.spoiler));
  if (els.q.value !== S.ui.q) els.q.value = S.ui.q;
}

function clearFilters() {
  S.ui.cat = 'all'; S.ui.grade = 'all'; S.ui.q = ''; S.ui.missing = false;
  persist(); syncFilters(); renderList(); syncUrl();
}

/* ---------- spoiler ---------- */
function setSpoiler(on) {
  S.ui.spoiler = on;
  persist();
  els.spoiler.setAttribute('aria-checked', String(on));
  renderAll();
  if (on) {
    const hidden = DATA.filter((t) => locked(t)).length;
    toast(`Spoiler mode on — ${hidden} story trophies hidden`);
  } else {
    toast('Spoiler mode off');
  }
}

/* ---------- roadmap ---------- */
const SRC = {
  pp: ['PowerPyx — GTA VI trophy guide and roadmap', 'https://www.powerpyx.com/gta-6-grand-theft-auto-vi-trophy-guide-roadmap/'],
  ps: ['PlayStation — GTA VI', 'https://www.playstation.com/en-us/games/grand-theft-auto-vi/'],
  ign: ['IGN — GTA VI wiki', 'https://www.ign.com/wikis/gta-6'],
  psn: ['PSNProfiles — GTA VI trophy list', 'https://psnprofiles.com/trophies/43531-grand-theft-auto-vi'],
  wiki: ['GTA Wiki — Achievements and Trophies in GTA VI', 'https://gta.wiki/w/Achievements_and_Trophies_in_GTA_VI'],
};

const PHASES = [
  { n: 1, title: 'Open the map', when: 'Chapters 1–2', src: [SRC.ps, SRC.pp], steps: [
    'Play the prologue and Chapter 1 in order: the early story trophies unlock on mission completion, not on skill.',
    'Take the first safehouse and the first heist before side content — they open travel and income.',
    'Nothing in Chapters 1–2 is missable — clear all seven phase-one trophies — six story missions plus the opening activity — then save at the Chapter 3 handoff.',
    'Keep a manual save at the start of each chapter; autosave overwrites, a manual slot is your undo.',
  ] },
  { n: 2, title: 'Story back half and missable windows', when: 'Chapters 3–5', src: [SRC.pp, SRC.psn], steps: [
    'Six story trophies land in Chapters 3–5. Clear them in order and treat each chapter finale as a checkpoint.',
    'Ten trophies in this phase are missable — four close in Chapter 3, four in Chapter 4, two in free roam.',
    'Before every chapter finale, finish the entries above that name your current chapter.',
    'Save to a new slot at the start of Chapters 3, 4 and 5 so a closed strand is one reload away.',
    'Partner activities need that partner in free roam — do them before the story stops keeping them around.',
    'If a marker stops spawning, reload the chapter-start save instead of finishing the story first.',
  ] },
  { n: 3, title: 'Side business and activities', when: 'Chapters 2–5, any time', src: [SRC.pp, SRC.ign], steps: [
    'Buy businesses early: income pays for the vehicle upgrades the stunt and race grinds assume.',
    'Run the counted grinds in the background of missions — jumps, near-misses and air time feed one counter.',
    'Six entries here are one-off strands, not counters: start each one once so nothing is left at 0% at the end.',
    'Attempt each activity type once before you master any: the nine-type trophy only asks for one attempt each.',
    'Let the counters do the bookkeeping; they clamp at the official totals, so a full bar is the real thing.',
  ] },
  { n: 4, title: 'Collectibles and exploration', when: 'Any chapter, region by region', src: [SRC.ign, SRC.wiki], steps: [
    'Sweep one region at a time; collectibles do not expire, so never backtrack mid-chapter for a single item.',
    'Do a region after its story missions, when the map has stopped gating districts.',
    'Use the source link on each set for a map rather than a video you have to scrub.',
    'If the in-game menu and this counter disagree, trust the in-game menu and adjust with shift-click.',
  ] },
  { n: 5, title: 'Platinum cleanup', when: 'Endgame', src: [SRC.ps, SRC.pp], steps: [
    'Filter to Missing only and read the leftovers before you plan a session.',
    'Clear every counted trophy before the final mission so travel still has destinations.',
    'Finish partner content before the credits — availability narrows after the story ends.',
    'The platinum unlocks with the 55th trophy; nothing here needs a second playthrough.',
  ] },
];

const chapIndex = (t) => {
  if (!t.chapter) return 9;
  const m = /Chapter (\d)/.exec(t.chapter);
  return m ? Number(m[1]) : 9;
};

function renderRoadmap() {
  const host = els.views.roadmap;
  const missables = DATA.filter((t) => t.missable)
    .sort((a, b) => chapIndex(a) - chapIndex(b) || a.name.localeCompare(b.name));

  const strip = h('div', { class: 'dnm' },
    h('h2', { text: `Do not miss — ${missables.length} trophies close for good` }),
    h('ul', {}, missables.map((t) => h('li', {},
      h('a', { href: `?trophy=${t.id}`, 'data-trophy': t.id, text: nameOf(t) }),
      ' ',
      h('em', { text: t.chapter ? t.chapter.replace('Chapter ', 'Ch. ') : 'Free roam' }),
      locked(t) ? '' : ` — ${t.roadmapNote || firstClause(t.missableNote)}`))));

  const cards = PHASES.map((p) => {
    const group = DATA.filter((t) => t.roadmapPhase === p.n);
    const miss = group.filter((t) => t.missable).length;
    const counted = group.filter((t) => t.count);
    const meta = h('div', { class: 'meta' },
      h('span', { text: `${group.length} trophies` }),
      h('span', { text: `${miss} missable` }),
      counted.length ? h('span', { text: `${counted.length} counted` }) : '',
      h('span', {}, h('a', { href: p.src[0][1], target: '_blank', rel: 'noopener noreferrer', text: p.src[0][0] })));
    const names = h('ul', { class: 'names' }, group.map((t) => h('li', {},
      h('a', { href: `?trophy=${t.id}`, 'data-trophy': t.id, text: nameOf(t) }),
      t.count ? h('span', { class: 'ctr', text: `×${fmtNum(t.count)}` }) : '',
      t.missable ? h('span', { class: 'mm', text: 'missable' }) : '')));
    return h('article', { class: 'phase' },
      h('header', {}, h('span', { class: 'no', text: `PHASE ${p.n}` }),
        h('h2', { text: p.title }), h('span', { class: 'when', text: p.when })),
      h('ol', {}, p.steps.map((s) => h('li', { text: s }))),
      names,
      meta);
  });

  host.replaceChildren(
    h('div', { class: 'head' }, h('h1', { text: 'Roadmap to platinum' }),
      h('span', { class: 'sub', text: '5 phases · read the missables first' })),
    strip,
    h('div', { class: 'phases' }, cards));
}

function firstClause(s) {
  if (!s) return '';
  const sentence = s.trim().split(/(?<=\.)\s/)[0];
  return sentence.length <= 190
    ? sentence
    : `${sentence.slice(0, sentence.lastIndexOf(' ', 187))}…`;
}

/* ---------- about ---------- */
function renderAbout() {
  const host = els.views.about;
  host.replaceChildren(h('div', { class: 'about' },
    h('div', { class: 'head' }, h('h1', { text: 'About this ledger' }),
      h('span', { class: 'sub', text: 'GTA VI trophy companion · 55 trophies · platinum route' })),
    h('p', { text: 'A tracker and route for the 55 trophies in Grand Theft Auto VI on PlayStation 5. Tick what you have earned, keep counted trophies honest, and read the phase order before you close a chapter.' }),
    h('h2', { text: 'Where the facts come from' }),
    h('p', { text: 'Names, descriptions and grades are the official list, kept as published. Every guide is written for this app and cites its sources at the bottom of the trophy: PlayStation\'s official description, PowerPyx, IGN\'s wiki, PSNProfiles or GTA Wiki. Community-reported details are labelled as such in the steps. Sources read November 2026, game version 1.0.' }),
    h('ul', { class: 'srcs about-srcs' }, [...new Map(
      DATA.flatMap((t) => t.sources || []).map((s) => [s.url, s]),
    ).values()].map((s) => h('li', {},
      h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label }),
      h('span', { text: hostOf(s.url) })))),
    h('p', { text: 'No runtime network calls: the trophy file is fetched once, after paint, from this folder. No fonts, images or scripts leave the page. Source links are plain links you can choose to open.' }),
    h('h2', { text: 'Progress and demo' }),
    h('p', {}, 'Progress lives in ', h('code', { text: 'localStorage[\'leonida-ledger/v1\']' }),
      ' as earned flags plus counters. Export writes ', h('code', { text: 'leonida-ledger-YYYY-MM-DD.json' }),
      '; import merges a file (earned OR, counters max) and reports what it took. Shift-click Import to paste JSON instead. ',
      h('code', { text: '?demo=1' }), ' seeds a sample save in memory only — it never touches your real progress, and closing demo restores it.'),
    !DEMO && h('p', { class: 'reset-line' }, 'Start clean: ',
      h('button', { class: 'danger-link', type: 'button', id: 'resetProgress' }, 'erase all progress'),
      ' — two clicks, no undo. Export first if you might want this save back.'),
    h('h2', { text: 'Keyboard' }),
    h('ul', { class: 'kbd' },
      h('li', {}, h('b', { text: '/' }), 'Focus search'),
      h('li', {}, h('b', { text: 'j / k' }), 'Next / previous trophy'),
      h('li', {}, h('b', { text: 'x' }), 'Tick the selected trophy'),
      h('li', {}, h('b', { text: 'g t / g r / g a' }), 'Tracker / Roadmap / About'),
      h('li', {}, h('b', { text: 'p' }), 'Print the checklist and route'),
      h('li', {}, h('b', { text: 'Esc' }), 'Close the detail sheet and popovers'),
      h('li', {}, h('b', { text: 'shift +' }), 'Add ten steps to a counter')),
    h('h2', { text: 'Reading the rows' }),
    h('p', { text: 'Grade chips: P platinum, G gold, S silver, B bronze. A pink MISSABLE badge means the trophy can close before you get to it — the detail pane says when. Counters clamp to the official total and mark the trophy earned when full.' })));
}

/* ---------- views + url ---------- */
function setView(view) {
  if (!PAGES.includes(view)) view = 'tracker';
  S.ui.view = view;
  els.tabs.forEach((t) => {
    const on = t.dataset.view === view;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  for (const [k, node] of Object.entries(els.views)) node.hidden = k !== view;
  if (view === 'roadmap') renderRoadmap();
  if (view === 'about') renderAbout();
  persist();
  syncUrl();
}

function printSheet() {
  renderRoadmap();
  document.body.classList.add('print-sheet');
  window.print();
}

function syncUrl() {
  const p = new URLSearchParams();
  if (S.ui.view !== 'tracker') p.set('view', S.ui.view);
  if (S.ui.cat !== 'all') p.set('cat', S.ui.cat);
  if (S.ui.grade !== 'all') p.set('grade', S.ui.grade);
  if (S.ui.q) p.set('q', S.ui.q);
  if (S.ui.missing) p.set('missing', '1');
  if (S.ui.spoiler) p.set('spoiler', '1');
  if (S.ui.lastTrophy) p.set('trophy', S.ui.lastTrophy);
  if (DEMO) p.set('demo', '1');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/* ---------- demo ---------- */
function seedDemo() {
  const s = DEF();
  const by = { gold: [], silver: [], bronze: [] };
  for (const t of DATA) if (by[t.grade]) by[t.grade].push(t.id);
  const ids = [by.gold[0], ...by.silver.slice(0, 3), ...by.bronze.filter((_, i) => i % 3 === 0).slice(0, 14)]
    .filter(Boolean).slice(0, 18);
  for (const id of ids) {
    s.earned[id] = true;
    const t = BY.get(id);
    if (t && t.count) s.counts[id] = t.count;
  }
  return s;
}

function enterDemo() {
  if (DEMO) return;
  const ui = { ...S.ui };
  S = seedDemo();
  S.ui = { ...ui };
  DEMO = true;
  els.demoTag.classList.add('on');
  els.demoBtn.textContent = 'Exit demo';
  renderAll();
  syncFilters();
  setView(S.ui.view);
  toast('Demo save loaded — your real progress is untouched');
}

function exitDemo() {
  if (!DEMO) return;
  DEMO = false;
  S = REAL;
  revealed = new Set();
  els.demoTag.classList.remove('on');
  els.demoBtn.textContent = 'Demo mode';
  renderAll();
  syncFilters();
  setView(S.ui.view);
  toast('Demo closed — back to your save');
}

/* ---------- export / import ---------- */
function exportSave() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = DEMO ? `leonida-ledger-demo-${stamp}.json` : `leonida-ledger-${stamp}.json`;
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Progress exported');
}

function normalizeImport(p) {
  if (Array.isArray(p)) {
    const earned = {};
    for (const id of p) if (typeof id === 'string') earned[id] = true;
    return { v: 1, earned, counts: {}, ui: {} };
  }
  if (p && typeof p === 'object' && p.v === 1) return p;
  return null;
}

function importText(text) {
  let p;
  try { p = JSON.parse(text); } catch { toast('Import failed: that is not JSON'); return; }
  const inc = normalizeImport(p);
  if (!inc) { toast('Import failed: not a Leonida Ledger save'); return; }
  let earned = 0; let counters = 0; let platinum = 0;
  for (const [id, v] of Object.entries(inc.earned || {})) {
    if (v !== true || !BY.has(id) || S.earned[id]) continue;
    if (BY.get(id).grade === 'platinum') { platinum++; continue; }
    S.earned[id] = true; earned++;
    if (BY.get(id).count) { S.counts[id] = BY.get(id).count; counters++; }
  }
  for (const [id, v] of Object.entries(inc.counts || {})) {
    const t = BY.get(id);
    if (!t || !t.count || !Number.isFinite(v)) continue;
    const nv = Math.min(t.count, Math.max(0, Math.floor(v)));
    if (nv > (S.counts[id] || 0)) { S.counts[id] = nv; counters++; }
    if (nv >= t.count) S.earned[id] = true;
  }
  persist();
  renderAll();
  const plat = DATA.find((t) => t.grade === 'platinum');
  const platPending = platinum > 0 && plat && !isEarned(plat);
  toast(`Imported ${earned} earned, ${counters} counter${counters === 1 ? '' : 's'}${platPending ? ' · platinum waits for the rest' : ''}`);
}

/* ---------- boot data ---------- */
async function boot() {
  const qp = new URLSearchParams(location.search);
  const fail = (msg) => {
    els.totals.textContent = 'Trophy data failed to load';
    els.list.replaceChildren(h('li', { class: 'empty-row' }, msg));
    els.hint.hidden = true;
    syncHeaderHeight();
  };

  try {
    const res = await fetch('./data/trophies.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    DATA = Array.isArray(doc.trophies) ? doc.trophies : [];
    if (!DATA.length) throw new Error('empty list');
    BY = new Map(DATA.map((t) => [t.id, t]));
  } catch (err) {
    fail(`Could not read data/trophies.json (${err.message}). Serve the folder over HTTP — node --experimental-strip-types serve.ts — and reload.`);
    return;
  }

  if (qp.get('demo') === '1') {
    const ui = { ...S.ui };
    S = seedDemo();
    S.ui = { ...ui };
    DEMO = true;
    els.demoTag.classList.add('on');
    els.demoBtn.textContent = 'Exit demo';
  }

  if (qp.get('q')) S.ui.q = qp.get('q').slice(0, 80);
  const v = qp.get('view');
  if (PAGES.includes(v)) S.ui.view = v;
  const c = qp.get('cat');
  if (CATS.includes(c)) S.ui.cat = c;
  const g = qp.get('grade');
  if (['platinum', 'gold', 'silver', 'bronze'].includes(g)) S.ui.grade = g;
  if (qp.has('spoiler')) S.ui.spoiler = qp.get('spoiler') === '1';
  if (qp.has('missing')) S.ui.missing = qp.get('missing') === '1';
  const tid = qp.get('trophy');
  if (tid && BY.has(tid)) S.ui.lastTrophy = tid;

  if (S.ui.lastTrophy && !BY.has(S.ui.lastTrophy)) S.ui.lastTrophy = null;

  sanitizeSave();
  renderTotals();
  renderAbout();
  syncFilters();
  renderList();
  renderDetail();
  setView(S.ui.view);
  if (S.ui.lastTrophy && S.ui.view === 'tracker') {
    const row = $(`.row[data-id="${S.ui.lastTrophy}"]`);
    if (row) row.classList.add('sel');
    if (qp.get('trophy') && window.matchMedia('(max-width: 999px)').matches) {
      els.detail.classList.add('open');
      els.detail.querySelector('.d-close')?.focus({ preventScroll: true });
    }
  }
}

/* ---------- events ---------- */
let searchTimer;
els.q.addEventListener('input', () => {
  S.ui.q = els.q.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { persist(); renderList(); syncUrl(); }, 120);
});

els.grade.addEventListener('change', () => {
  S.ui.grade = els.grade.value;
  persist(); renderList(); syncUrl();
});

els.missing.addEventListener('change', () => {
  S.ui.missing = els.missing.checked;
  persist(); renderList(); syncUrl();
});

els.cats.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) setCat(chip.dataset.cat);
});

els.clear.addEventListener('click', clearFilters);

els.spoiler.addEventListener('click', () => setSpoiler(!S.ui.spoiler));

els.tabs.forEach((t, i) => {
  t.addEventListener('click', () => setView(t.dataset.view));
  t.addEventListener('keydown', (e) => {
    let next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % els.tabs.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + els.tabs.length) % els.tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = els.tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    els.tabs[next].focus();
    setView(els.tabs[next].dataset.view);
  });
});

$('#printBtn').addEventListener('click', printSheet);
window.addEventListener('afterprint', () => document.body.classList.remove('print-sheet'));

els.demoBtn.addEventListener('click', () => (DEMO ? exitDemo() : enterDemo()));

function resetProgress(btn) {
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = 'click again to erase everything';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      if (!btn.isConnected) return;
      btn.dataset.armed = '0';
      btn.textContent = 'erase all progress';
    }, 4000);
    return;
  }
  clearTimeout(resetTimer);
  if (DEMO) return;
  const { spoiler } = S.ui;
  REAL = DEF();
  REAL.ui.spoiler = spoiler;
  S = REAL;
  revealed = new Set();
  persist();
  renderAll();
  syncFilters();
  setView('tracker');
  toast('Progress erased — fresh ledger');
}

els.views.about.addEventListener('click', (e) => {
  const btn = e.target.closest('#resetProgress');
  if (btn) resetProgress(btn);
});

$('#export').addEventListener('click', exportSave);
$('#importBtn').addEventListener('click', (e) => {
  if (e.shiftKey) {
    const text = window.prompt('Paste an exported Leonida Ledger JSON:');
    if (text) importText(text);
    return;
  }
  els.importFile.click();
});

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files && els.importFile.files[0];
  if (!file) return;
  importText(await file.text());
  els.importFile.value = '';
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-trophy]');
  if (a) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setView('tracker');
    select(a.dataset.trophy);
  }
});

/* help popover */
function toggleHelp(force) {
  const open = force ?? els.help.hidden;
  els.help.hidden = !open;
  els.helpBtn.setAttribute('aria-expanded', String(open));
  if (open) els.help.focus({ preventScroll: true });
  else if (document.activeElement === els.help) els.helpBtn.focus({ preventScroll: true });
}
els.helpBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(); });
document.addEventListener('click', (e) => {
  if (!els.help.hidden && !e.target.closest('#help, #helpBtn')) toggleHelp(false);
});

/* keyboard */
let gAt = 0;
function move(step) {
  const rows = visible();
  if (!rows.length) return;
  const i = rows.findIndex((t) => t.id === S.ui.lastTrophy);
  const from = i === -1 ? (step > 0 ? 0 : rows.length - 1) : i + step;
  const next = rows[Math.max(0, Math.min(rows.length - 1, from))];
  select(next.id);
}

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toUpperCase();
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  if (e.key === '/' && !typing) {
    e.preventDefault();
    setView('tracker');
    els.q.focus(); els.q.select();
    return;
  }
  if (e.key === 'Escape') {
    const helpWasOpen = !els.help.hidden;
    toggleHelp(false);
    if (!helpWasOpen && els.detail.classList.contains('open')) closeDetail();
    if (document.activeElement === els.q) els.q.blur();
    return;
  }
  if (typing) return;
  if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
  if (e.key === 'j' || e.key === 'k') {
    if (S.ui.view !== 'tracker') return;
    e.preventDefault(); move(e.key === 'j' ? 1 : -1); return;
  }
  if (e.key === 'x') {
    if (S.ui.view !== 'tracker') return;
    const rows = visible();
    const kept = rows.some((t) => t.id === S.ui.lastTrophy) ? S.ui.lastTrophy : rows[0]?.id;
    if (!kept) return;
    e.preventDefault();
    const t = BY.get(kept);
    if (!t) return;
    if (t.grade === 'platinum') { toast('The platinum unlocks with the other 54.'); return; }
    setEarned(kept, !isEarned(t));
    return;
  }
  if (e.key === 'g') { gAt = Date.now(); return; }
  if ((e.key === 't' || e.key === 'r' || e.key === 'a') && Date.now() - gAt < 900) {
    setView(e.key === 't' ? 'tracker' : e.key === 'r' ? 'roadmap' : 'about');
    gAt = 0;
    return;
  }
  if (e.key === 'p') { e.preventDefault(); printSheet(); }
});

function sanitizeSave() {
  let dirty = false;
  for (const t of DATA) {
    if (!t.count || !S.earned[t.id]) continue;
    if ((S.counts[t.id] ?? 0) < t.count) { S.counts[t.id] = t.count; dirty = true; }
  }
  const othersDone = DATA.some((t) => t.grade !== 'platinum')
    && DATA.every((t) => t.grade === 'platinum' || isEarned(t));
  if (othersDone) { if (dirty) persist(); return; }
  for (const t of DATA) {
    if (t.grade === 'platinum' && S.earned[t.id]) { delete S.earned[t.id]; dirty = true; }
  }
  if (dirty) persist();
}

function renderAll() {
  sanitizeSave();
  renderTotals();
  renderList();
  renderDetail();
  if (S.ui.view === 'roadmap') renderRoadmap();
}

boot();
