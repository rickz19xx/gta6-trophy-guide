/* GTA VI trophy guide — offline static app.
 * One data source: data/trophies.json, fetched once. One local store:
 * localStorage "gta6-progress-v1", an object of trophy id -> true.
 * No build step, no inline handlers, no external assets, no other requests.
 */
'use strict';

const DATA_URL = 'data/trophies.json';
const PROGRESS_KEY = 'gta6-progress-v1';
const GRADES = ['platinum', 'gold', 'silver', 'bronze'];
const GRADE_RANK = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
const GRADE_WORD = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
const DIFFICULTY_MAX = 5;
const SORTS = ['order', 'name', 'difficulty', 'time'];
const DEMO_SHARE = 0.45;

const state = {
  game: 'Trophy guide',
  platform: '',
  listNote: '',
  updated: '',
  trophies: [],
  byId: new Map(),
  byName: new Map(),
  categories: {},
  progress: {},
  view: 'list',          // 'list' | 'detail' | 'roadmap'
  selectedId: null,
  renderedId: null,
  filters: {
    q: '',
    grade: '',
    category: '',
    missable: false,
    hideEarned: false,
    showHidden: false,
    sort: 'order',
  },
};

const dom = {};

/* ------------------------------- tiny helpers ----------------------------- */

function $(selector, root) {
  return (root || document).querySelector(selector);
}

function el(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') node.textContent = String(value);
      else if (key === 'class') node.className = String(value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  const kids = Array.prototype.slice.call(arguments, 2);
  for (const kid of kids) {
    for (const one of Array.isArray(kid) ? kid : [kid]) {
      if (one === null || one === undefined || one === false || one === '') continue;
      node.append(one instanceof Node ? one : document.createTextNode(String(one)));
    }
  }
  return node;
}

function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function label(value) {
  return fmt(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(fmt).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.keys(value).map((key) => fmt(value[key])).filter(Boolean).join(' — ');
  }
  return String(value);
}

function truthy(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    return word === '1' || word === 'true' || word === 'yes' || word === 'y' || word === 'on';
  }
  return false;
}

function paramBool(value) {
  if (value === null || value === undefined) return false;
  const word = String(value).trim().toLowerCase();
  return word !== '' && word !== '0' && word !== 'false' && word !== 'no' && word !== 'off';
}

function orderOf(trophy) {
  const n = Number(trophy.order);
  if (Number.isFinite(n)) return n;
  const id = Number(trophy.id);
  return Number.isFinite(id) ? id : 0;
}

function gradeWord(grade) {
  return GRADE_WORD[grade] || label(grade) || 'Trophy';
}

function actTitle(act) {
  const text = fmt(act);
  if (!text) return 'Unassigned';
  return /^\d+$/.test(text) ? 'Act ' + text : label(text);
}

/* "1 h", "10 min", "60-80 h", "1h30m" -> minutes, or null when unreadable. */
function timeToMinutes(value) {
  const text = fmt(value).toLowerCase();
  if (!text) return null;
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (/hour|\d\s*h(?:rs?)?(?=\d|\s|$)/.test(text)) {
    return nums[0] * 60 + (nums.length > 1 ? nums[1] : 0);
  }
  return nums[0];
}

function sortMinutes(trophy) {
  const minutes = timeToMinutes(trophy.time);
  return minutes === null ? -1 : minutes;
}

function difficultyDots(level) {
  const filled = Math.max(0, Math.min(DIFFICULTY_MAX, Math.round(Number(level) || 0)));
  const wrap = el('span', { class: 'dots', 'aria-label': 'Difficulty ' + filled + ' of ' + DIFFICULTY_MAX });
  for (let i = 1; i <= DIFFICULTY_MAX; i++) wrap.append(el('i', { class: i <= filled ? 'dot on' : 'dot' }));
  return wrap;
}

/* Steps and tips are plain strings in the data, but objects would also work. */
function stepText(step) {
  if (step === null || step === undefined) return '';
  if (typeof step === 'string') return step;
  if (typeof step !== 'object') return String(step);
  const head = step.title || step.name || step.step || step.label || '';
  const body = step.text || step.detail || step.description || step.note || '';
  const joined = [head, body].filter((part) => typeof part === 'string' && part.trim()).join(' — ');
  return joined || fmt(step);
}

/* --------------------------------- progress ------------------------------- */

function readStoredProgress() {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const kept = {};
    for (const key of Object.keys(parsed)) if (parsed[key]) kept[key] = true;
    return kept;
  } catch (err) {
    return null;
  }
}

function saveProgress() {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
  } catch (err) {
    /* private mode or a full quota: the guide keeps working in memory */
  }
}

function isEarned(id) {
  return state.progress[String(id)] === true;
}

function setEarned(id, earned) {
  const key = String(id);
  if (earned) state.progress[key] = true;
  else delete state.progress[key];
  saveProgress();
}

function counters() {
  const total = state.trophies.length;
  let earned = 0;
  const byGrade = {};
  for (const grade of GRADES) byGrade[grade] = { total: 0, earned: 0 };
  for (const trophy of state.trophies) {
    const bucket = byGrade[trophy.grade] || (byGrade[trophy.grade] = { total: 0, earned: 0 });
    bucket.total += 1;
    if (isEarned(trophy.id)) {
      earned += 1;
      bucket.earned += 1;
    }
  }
  return { total, earned, byGrade, pct: total ? Math.round((earned / total) * 100) : 0 };
}

/* A cold load of ?demo=1 with no saved progress fills in roughly 45%. */
function seedDemo() {
  const lowest = state.trophies.slice().sort((a, b) => {
    const rank = (GRADE_RANK[b.grade] || 0) - (GRADE_RANK[a.grade] || 0);
    return rank || orderOf(a) - orderOf(b);
  });
  const target = Math.round(state.trophies.length * DEMO_SHARE);
  const next = {};
  let taken = 0;
  for (const trophy of lowest) {
    if (taken >= target) break;
    if (trophy.grade === 'platinum') continue;
    next[String(trophy.id)] = true;
    taken += 1;
  }
  state.progress = next;
  saveProgress();
}

/* --------------------------------- filtering ------------------------------ */

function searchHaystack(trophy) {
  return [trophy.name, trophy.description, trophy.region, trophy.landmark, trophy.overview]
    .map(fmt)
    .join(' ')
    .toLowerCase();
}

function sortTrophies(list, mode) {
  const out = list.slice();
  if (mode === 'name') {
    out.sort((a, b) => String(a.name).localeCompare(String(b.name)) || orderOf(a) - orderOf(b));
  } else if (mode === 'difficulty') {
    out.sort((a, b) => (Number(b.difficulty) || 0) - (Number(a.difficulty) || 0) || orderOf(a) - orderOf(b));
  } else if (mode === 'time') {
    out.sort((a, b) => sortMinutes(b) - sortMinutes(a) || orderOf(a) - orderOf(b));
  } else {
    out.sort((a, b) => orderOf(a) - orderOf(b));
  }
  return out;
}

function visibleTrophies() {
  const f = state.filters;
  const query = f.q.trim().toLowerCase();
  const list = state.trophies.filter((trophy) => {
    if (f.grade && trophy.grade !== f.grade) return false;
    if (f.category && fmt(trophy.category) !== f.category) return false;
    if (f.missable && !trophy.missable) return false;
    if (f.hideEarned && isEarned(trophy.id)) return false;
    if (query && !searchHaystack(trophy).includes(query)) return false;
    return true;
  });
  return sortTrophies(list, f.sort);
}

function categoryList() {
  const seen = new Map();
  for (const trophy of state.trophies) {
    const key = fmt(trophy.category) || 'Uncategorised';
    const order = orderOf(trophy);
    seen.set(key, seen.has(key) ? Math.min(seen.get(key), order) : order);
  }
  for (const key of Object.keys(state.categories)) {
    if (!seen.has(key)) seen.set(key, Number.MAX_SAFE_INTEGER);
  }
  return Array.from(seen.keys()).sort((a, b) => seen.get(a) - seen.get(b) || a.localeCompare(b));
}

/* ---------------------------------- routes -------------------------------- */

/* #/  #/t/12  #/roadmap, each with an optional ?q=&grade=&category=&missable=
 * &earned=hide&hidden=1&sort=... The same names work as plain search params,
 * so both /?grade=gold and #/?grade=gold open the same view. */
function parseRoute() {
  const raw = String(window.location.hash || '').replace(/^#/, '');
  const cut = raw.indexOf('?');
  const path = (cut === -1 ? raw : raw.slice(0, cut)) || '/';
  const params = new URLSearchParams();
  new URLSearchParams(String(window.location.search || '')).forEach((value, key) => params.set(key, value));
  if (cut !== -1) {
    new URLSearchParams(raw.slice(cut + 1)).forEach((value, key) => params.set(key, value));
  }
  const segments = path.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch (err) { return part; }
  });
  let view = 'list';
  let id = null;
  if (segments[0] === 't' && segments.length > 1) {
    view = 'detail';
    id = segments[1];
  } else if (segments[0] === 'roadmap') {
    view = 'roadmap';
  }
  return { view, id, params };
}

function applyFiltersFromParams(params) {
  const f = state.filters;
  f.q = params.get('q') || '';
  const grade = (params.get('grade') || '').trim().toLowerCase();
  f.grade = GRADES.includes(grade) ? grade : '';
  f.category = params.get('category') || '';
  f.missable = paramBool(params.get('missable'));
  const earned = (params.get('earned') || '').trim().toLowerCase();
  f.hideEarned = earned === 'hide' || earned === 'hidden' || earned === '1' || earned === 'true' || earned === 'yes';
  f.showHidden = paramBool(params.get('hidden'));
  const sort = (params.get('sort') || '').trim().toLowerCase();
  f.sort = SORTS.includes(sort) ? sort : 'order';
}

function applyRoute(route) {
  applyFiltersFromParams(route.params);
  if (state.selectedId !== null && !state.byId.has(String(state.selectedId))) state.selectedId = null;
  if (route.view === 'detail' && state.byId.has(String(route.id))) {
    state.view = 'detail';
    state.selectedId = String(route.id);
  } else if (route.view === 'roadmap') {
    state.view = 'roadmap';
  } else {
    state.view = 'list';
    state.selectedId = null;
  }
  if (dom.search) dom.search.value = state.filters.q;
  if (dom.sort) dom.sort.value = state.filters.sort;
}

function buildHash() {
  const f = state.filters;
  const params = new URLSearchParams();
  const query = f.q.trim();
  if (query) params.set('q', query);
  if (f.grade) params.set('grade', f.grade);
  if (f.category) params.set('category', f.category);
  if (f.missable) params.set('missable', '1');
  if (f.hideEarned) params.set('earned', 'hide');
  if (f.showHidden) params.set('hidden', '1');
  if (f.sort !== 'order') params.set('sort', f.sort);
  const search = params.toString();
  let path = '/';
  if (state.view === 'roadmap') path = '/roadmap';
  else if (state.view === 'detail' && state.selectedId !== null) path = '/t/' + encodeURIComponent(state.selectedId);
  return '#' + path + (search ? '?' + search : '');
}

/* Keeps the address bar in step with the UI without pushing history entries,
 * so bundled/back navigation never fights the filters. */
function syncHash() {
  const next = buildHash();
  if ('#' + String(window.location.hash || '').replace(/^#/, '') === next) return;
  try {
    window.history.replaceState(null, '', next);
  } catch (err) {
    window.location.hash = next;
  }
}

function selectTrophy(id) {
  if (id === null || id === undefined) {
    state.view = 'list';
    state.selectedId = null;
  } else {
    state.view = 'detail';
    state.selectedId = String(id);
  }
  render();
}

/* ------------------------------- the chrome ------------------------------- */

function render() {
  const active = document.activeElement;
  const focusId = active && active.classList && active.classList.contains('step-check') ? active.id : null;
  const keepScroll = state.renderedId === String(state.selectedId) && dom.detail ? dom.detail.scrollTop : 0;
  renderChrome();
  markChips();
  renderList();
  renderDetail(keepScroll);
  state.renderedId = String(state.selectedId);
  syncHash();
  if (focusId) {
    const node = document.getElementById(focusId);
    if (node && typeof node.focus === 'function') node.focus({ preventScroll: true });
  }
}

function counterPill(text, earned, total, grade) {
  return el('span', { class: 'counter', dataset: { grade } },
    el('b', { text: earned + '/' + total }),
    el('span', { class: 'counter-label', text })
  );
}

function renderChrome() {
  const count = counters();
  if (dom.gameName) dom.gameName.textContent = state.game || 'Trophy guide';
  if (dom.platformLine) {
    const bits = [state.platform, count.total ? count.total + ' trophies' : ''];
    if (state.updated) bits.push('updated ' + state.updated);
    dom.platformLine.textContent = bits.filter(Boolean).join(' · ');
  }
  if (dom.progressPct) dom.progressPct.textContent = count.pct + '%';
  if (dom.progressFill) dom.progressFill.style.width = count.pct + '%';
  if (dom.progressBar) {
    dom.progressBar.setAttribute('aria-valuenow', String(count.pct));
    dom.progressBar.setAttribute('aria-valuetext', count.earned + ' of ' + count.total + ' trophies earned');
  }
  if (dom.progressMeta) {
    const platinum = count.byGrade.platinum || { earned: 0, total: 0 };
    dom.progressMeta.textContent = count.earned + ' of ' + count.total + ' earned · platinum ' +
      (platinum.earned ? 'unlocked' : 'locked');
  }
  document.title = (state.game || 'GTA VI') + ' trophy guide — ' + count.earned + '/' + count.total + ' (' + count.pct + '%)';
  if (dom.counters) {
    clear(dom.counters);
    dom.counters.append(counterPill('all', count.earned, count.total, 'all'));
    for (const grade of GRADES) {
      const bucket = count.byGrade[grade];
      if (!bucket || !bucket.total) continue;
      dom.counters.append(counterPill(gradeWord(grade), bucket.earned, bucket.total, grade));
    }
  }
}

function chipButton(kind, value, text) {
  const chip = el('button', { type: 'button', class: 'chip', text, dataset: { chip: kind, value } });
  chip.addEventListener('click', () => toggleChip(kind, value));
  return chip;
}

function renderChips() {
  clear(dom.gradeChips);
  for (const grade of GRADES) dom.gradeChips.append(chipButton('grade', grade, gradeWord(grade)));
  clear(dom.categoryChips);
  for (const category of categoryList()) dom.categoryChips.append(chipButton('category', category, label(category)));
  clear(dom.toggleChips);
  dom.toggleChips.append(chipButton('missable', '1', 'Missable only'));
  dom.toggleChips.append(chipButton('earned', 'hide', 'Hide earned'));
  dom.toggleChips.append(chipButton('hidden', '1', 'Show hidden'));
  markChips();
}

function isChipOn(kind, value) {
  const f = state.filters;
  if (kind === 'grade') return f.grade === value;
  if (kind === 'category') return f.category === value;
  if (kind === 'missable') return f.missable;
  if (kind === 'earned') return f.hideEarned;
  if (kind === 'hidden') return f.showHidden;
  return false;
}

function markChips() {
  for (const chip of document.querySelectorAll('.chip')) {
    const on = isChipOn(chip.dataset.chip, chip.dataset.value);
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function toggleChip(kind, value) {
  const f = state.filters;
  if (kind === 'grade') f.grade = f.grade === value ? '' : value;
  else if (kind === 'category') f.category = f.category === value ? '' : value;
  else if (kind === 'missable') f.missable = !f.missable;
  else if (kind === 'earned') f.hideEarned = !f.hideEarned;
  else if (kind === 'hidden') f.showHidden = !f.showHidden;
  render();
}

/* --------------------------------- the list ------------------------------- */

function categoryTag(category) {
  return el('span', { class: 'tag', text: label(category) });
}

function listRow(trophy, index) {
  const earned = isEarned(trophy.id);
  const selected = state.selectedId !== null && String(state.selectedId) === String(trophy.id);
  let classes = 'row';
  if (earned) classes += ' is-earned';
  if (selected) classes += ' is-selected';
  if (trophy.missable) classes += ' is-missable';
  const row = el('button', { type: 'button', class: classes, dataset: { id: String(trophy.id) } });
  row.append(el('span', { class: 'grade-badge', dataset: { grade: trophy.grade }, text: gradeWord(trophy.grade) }));

  const main = el('span', { class: 'row-main' });
  const name = el('span', { class: 'row-name' });
  if (index) name.append(el('span', { class: 'row-index', text: String(index) }));
  name.append(el('span', { text: displayName(trophy) }));
  main.append(name);
  const description = displayDescription(trophy);
  if (description) main.append(el('span', { class: 'row-desc', text: description }));
  const meta = el('span', { class: 'row-meta' });
  if (fmt(trophy.category)) meta.append(categoryTag(trophy.category));
  if (fmt(trophy.act)) meta.append(el('span', { class: 'tag', text: actTitle(trophy.act) }));
  if (trophy.missable) meta.append(el('span', { class: 'tag tag-missable', text: 'Missable' }));
  if (earned) meta.append(el('span', { class: 'tag tag-earned', text: 'Earned' }));
  main.append(meta);
  row.append(main);

  const side = el('span', { class: 'row-side' });
  if (fmt(trophy.time)) side.append(el('span', { class: 'row-time', text: fmt(trophy.time) }));
  if (Number(trophy.difficulty)) side.append(difficultyDots(trophy.difficulty));
  row.append(side);

  row.addEventListener('click', () => selectTrophy(trophy.id));
  return row;
}

function renderList() {
  if (!dom.list) return;
  clear(dom.list);
  if (state.view === 'roadmap') {
    renderRoadmapList();
    return;
  }
  const items = visibleTrophies();
  if (dom.listHead) {
    dom.listHead.textContent = items.length === state.trophies.length
      ? items.length + ' trophies'
      : items.length + ' of ' + state.trophies.length + ' trophies';
  }
  if (dom.empty) dom.empty.hidden = items.length > 0;
  for (const trophy of items) dom.list.append(el('li', { class: 'list-item' }, listRow(trophy)));
}

function renderRoadmapList() {
  const items = sortTrophies(state.trophies, 'order');
  if (dom.listHead) dom.listHead.textContent = 'Roadmap · all ' + items.length + ' trophies in completion order';
  if (dom.empty) dom.empty.hidden = true;
  const groups = new Map();
  for (const trophy of items) {
    const key = fmt(trophy.act) || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trophy);
  }
  for (const entry of groups) {
    const act = entry[0];
    const list = entry[1];
    const earned = list.filter((trophy) => isEarned(trophy.id)).length;
    dom.list.append(el('li', { class: 'group-head' },
      el('span', { class: 'group-title', text: actTitle(act) }),
      el('span', { class: 'group-count', text: earned + '/' + list.length + ' earned' })
    ));
    list.forEach((trophy, i) => {
      dom.list.append(el('li', { class: 'list-item' }, listRow(trophy, i + 1)));
    });
  }
}

function scrollRowIntoView(id) {
  const key = String(id);
  for (const row of document.querySelectorAll('.row')) {
    if (row.dataset.id === key) {
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
      return;
    }
  }
}

function moveSelection(delta) {
  const pool = state.view === 'roadmap' ? sortTrophies(state.trophies, 'order') : visibleTrophies();
  if (!pool.length) return;
  let index = pool.findIndex((trophy) => String(trophy.id) === String(state.selectedId));
  if (index === -1) index = delta > 0 ? -1 : pool.length;
  let next = index + delta;
  if (next < 0) next = 0;
  if (next > pool.length - 1) next = pool.length - 1;
  const target = pool[next];
  if (!target) return;
  if (state.view === 'roadmap') {
    state.selectedId = String(target.id);
    render();
  } else {
    selectTrophy(target.id);
  }
  scrollRowIntoView(target.id);
}

/* --------------------------- hidden trophy masking ------------------------ */

/* Hidden trophies stay masked until they are earned or the reader asks for
 * them with the "Show hidden" chip (or ?hidden=1). The row itself always
 * stays in the list — a guide should still show that the trophy exists. */
function isRevealed(trophy) {
  return !trophy.hidden || state.filters.showHidden || isEarned(trophy.id);
}

function displayName(trophy) {
  return isRevealed(trophy) ? (trophy.name || 'Unknown trophy') : 'Hidden trophy';
}

function displayDescription(trophy) {
  if (isRevealed(trophy)) return trophy.description || '';
  return 'Secret trophy — switch on "Show hidden" to reveal it.';
}

function lookupTrophy(key) {
  if (key === null || key === undefined) return null;
  return state.byId.get(String(key)) || state.byName.get(String(key).trim().toLowerCase()) || null;
}

/* -------------------------------- detail pane ------------------------------ */

function renderDetail(scrollTop) {
  const pane = dom.detail;
  if (!pane) return;
  clear(pane);
  if (state.view === 'roadmap') {
    pane.append(roadmapSummary());
  } else {
    const trophy = state.selectedId === null ? null : state.byId.get(String(state.selectedId));
    pane.append(trophy ? detailPanel(trophy) : welcomePanel());
  }
  pane.scrollTop = scrollTop || 0;
}

function section(title, ...children) {
  const block = el('section', { class: 'section' }, el('h3', { class: 'section-title', text: title }));
  for (const child of children) block.append(child);
  return block;
}

function statCard(value, title) {
  return el('div', { class: 'stat' },
    el('span', { class: 'stat-value', text: value }),
    el('span', { class: 'stat-label', text: title })
  );
}

function badgeRow(trophy) {
  const row = el('div', { class: 'badges' });
  const item = (key, node) => el('span', { class: 'badge-item' },
    el('span', { class: 'badge-key', text: key }),
    node
  );
  const value = (text) => el('span', { class: 'badge-val', text });
  if (fmt(trophy.category)) row.append(item('Category', categoryTag(trophy.category)));
  if (fmt(trophy.act)) row.append(item('Act', value(actTitle(trophy.act))));
  if (fmt(trophy.region)) row.append(item('Region', value(fmt(trophy.region))));
  if (fmt(trophy.landmark)) row.append(item('Landmark', value(fmt(trophy.landmark))));
  if (fmt(trophy.time)) row.append(item('Time', value(fmt(trophy.time))));
  if (Number(trophy.difficulty)) row.append(item('Difficulty', difficultyDots(trophy.difficulty)));
  if (trophy.hidden) row.append(item('Visibility', value('Hidden trophy')));
  return row;
}

function stepsList(trophy, earned) {
  const list = el('ul', { class: 'steps' });
  const steps = Array.isArray(trophy.steps) ? trophy.steps : [];
  steps.forEach((step, i) => {
    const id = 'step-' + trophy.id + '-' + i;
    const box = el('input', { type: 'checkbox', class: 'step-check', id, dataset: { id: String(trophy.id) } });
    box.checked = earned;
    box.addEventListener('change', () => {
      setEarned(trophy.id, box.checked);
      render();
    });
    list.append(el('li', { class: 'step' + (earned ? ' done' : '') },
      box,
      el('label', { class: 'step-text', 'for': id, text: stepText(step) })
    ));
  });
  if (!steps.length) list.append(el('li', { class: 'step', text: 'No walkthrough steps were written for this trophy.' }));
  return list;
}

/* Prerequisites are trophy names in this data set; an id or an object with an
 * id works just as well and turns into a link into that trophy. */
function prereqNodes(trophy) {
  const raw = trophy.prereqs;
  const entries = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return entries.map((entry) => {
    const isObject = entry && typeof entry === 'object';
    const key = isObject ? (entry.id !== undefined ? entry.id : entry.trophyId) : entry;
    const text = isObject ? (entry.name || entry.title || fmt(entry)) : fmt(entry);
    const known = lookupTrophy(key);
    if (known) {
      return el('li', { class: 'prereq' },
        el('a', { class: 'link', href: '#/t/' + encodeURIComponent(known.id), text: known.name || text }),
        el('span', { class: 'tag', text: gradeWord(known.grade) })
      );
    }
    return el('li', { class: 'prereq', text: text || '—' });
  });
}

function detailPanel(trophy) {
  const earned = isEarned(trophy.id);
  const revealed = isRevealed(trophy);
  const panel = el('article', { class: 'detail' + (earned ? ' is-earned' : '') });

  const head = el('header', { class: 'detail-head' });
  head.append(el('span', { class: 'grade-badge big', dataset: { grade: trophy.grade }, text: gradeWord(trophy.grade) }));
  head.append(el('h2', { class: 'detail-title', text: displayName(trophy) }));
  const toggle = el('button', {
    type: 'button',
    class: 'btn earn-toggle',
    'aria-pressed': earned ? 'true' : 'false',
    text: earned ? 'Earned ✓ — click to undo' : 'Mark as earned (E)',
  });
  toggle.addEventListener('click', () => {
    setEarned(trophy.id, !isEarned(trophy.id));
    render();
  });
  head.append(toggle);
  panel.append(head);

  const description = displayDescription(trophy);
  if (description) panel.append(el('p', { class: 'detail-desc', text: description }));
  panel.append(badgeRow(trophy));

  if (trophy.missable) {
    const note = fmt(trophy.missableNote) || 'Grab this one while you can — it can be lost for good.';
    panel.append(el('div', { class: 'missable', role: 'note' },
      el('strong', { text: 'Missable' }),
      el('span', { text: note })
    ));
  }

  if (revealed && fmt(trophy.guide)) {
    panel.append(el('div', { class: 'callout' }, el('strong', { text: 'How to get it: ' }), fmt(trophy.guide)));
  }

  if (!revealed) {
    panel.append(section('Hidden trophy',
      el('p', { class: 'body-text', text: 'Requirements, steps and tips stay masked until this trophy is earned, or until "Show hidden" is switched on in the list.' })
    ));
  } else {
    const prereqs = prereqNodes(trophy);
    if (prereqs.length) panel.append(section('Prerequisites', el('ul', { class: 'prereqs' }, prereqs)));
    if (fmt(trophy.collectibles)) panel.append(section('Collectibles', el('p', { class: 'body-text', text: fmt(trophy.collectibles) })));
    if (fmt(trophy.overview)) panel.append(section('Overview', el('p', { class: 'body-text', text: fmt(trophy.overview) })));

    const steps = Array.isArray(trophy.steps) ? trophy.steps : [];
    panel.append(section('Steps' + (steps.length ? ' · ' + steps.length : ''), stepsList(trophy, earned),
      el('p', { class: 'hint-text', text: 'Ticking any step marks this trophy as earned; unticking it undoes that.' })));

    const tips = Array.isArray(trophy.tips) ? trophy.tips : [];
    if (tips.length) {
      panel.append(section('Tips', el('ul', { class: 'tips' }, tips.map((tip) => el('li', { text: stepText(tip) })))));
    }
  }

  panel.append(navFooter(trophy));
  return panel;
}

/* Prev/next walk the filtered list when the trophy is in it, and the whole
 * guide in the current sort order when a filter hides it. */
function navPool(trophy) {
  const visible = visibleTrophies();
  if (visible.some((item) => String(item.id) === String(trophy.id))) return visible;
  return sortTrophies(state.trophies, state.filters.sort);
}

function navButton(target, direction) {
  const button = el('button', { type: 'button', class: 'btn nav-btn', disabled: target ? null : true });
  button.append(el('span', { class: 'nav-dir', text: direction === 'prev' ? '← Previous' : 'Next →' }));
  if (target) {
    button.append(el('span', { class: 'nav-name', text: target.name }));
    button.addEventListener('click', () => selectTrophy(target.id));
  }
  return button;
}

function navFooter(trophy) {
  const pool = navPool(trophy);
  const index = pool.findIndex((item) => String(item.id) === String(trophy.id));
  const prev = index > 0 ? pool[index - 1] : null;
  const next = index >= 0 && index < pool.length - 1 ? pool[index + 1] : null;
  const foot = el('footer', { class: 'detail-foot' });
  foot.append(navButton(prev, 'prev'));
  foot.append(el('span', { class: 'nav-pos', text: index >= 0 ? (index + 1) + ' / ' + pool.length : '' }));
  foot.append(navButton(next, 'next'));
  return foot;
}

function welcomePanel() {
  const count = counters();
  const wrap = el('div', { class: 'welcome' });
  wrap.append(el('p', { class: 'eyebrow', text: 'Offline trophy checklist' }));
  wrap.append(el('h2', { class: 'welcome-title', text: (state.game || 'Grand Theft Auto VI') + ' — the road to platinum' }));
  wrap.append(el('p', { class: 'welcome-lead', text: 'Pick any trophy on the left for its requirements, region, steps and tips. Ticks are kept in this browser only, and export/import move them between machines.' }));
  if (state.listNote) wrap.append(el('p', { class: 'hint-text', text: state.listNote }));

  const grid = el('div', { class: 'stat-grid' });
  grid.append(statCard(count.earned + ' / ' + count.total, 'Earned'));
  grid.append(statCard(count.pct + '%', 'Completion'));
  for (const grade of GRADES) {
    const bucket = count.byGrade[grade];
    if (bucket && bucket.total) grid.append(statCard(bucket.earned + ' / ' + bucket.total, gradeWord(grade)));
  }
  wrap.append(grid);

  const pool = visibleTrophies();
  if (pool.length) {
    const start = el('button', { type: 'button', class: 'btn', text: 'Start with ' + pool[0].name + ' →' });
    start.addEventListener('click', () => selectTrophy(pool[0].id));
    wrap.append(el('p', { class: 'hint-text' }, start));
  }

  const keys = el('div', { class: 'keymap' });
  const shortcuts = [
    ['/', 'focus search'],
    ['j / k', 'move selection'],
    ['Enter', 'open trophy'],
    ['e', 'mark earned'],
    ['Esc', 'clear search'],
  ];
  for (const pair of shortcuts) {
    keys.append(el('span', { class: 'keymap-item' }, el('kbd', { text: pair[0] }), el('span', { text: pair[1] })));
  }
  wrap.append(keys);
  return wrap;
}

function roadmapGroups(list) {
  const groups = new Map();
  for (const trophy of list) {
    const key = fmt(trophy.act) || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trophy);
  }
  return Array.from(groups.entries());
}

function roadmapSummary() {
  const wrap = el('div', { class: 'welcome' });
  const count = counters();
  wrap.append(el('p', { class: 'eyebrow', text: 'Completion order' }));
  wrap.append(el('h2', { class: 'welcome-title', text: 'Roadmap — all ' + count.total + ' trophies' }));
  wrap.append(el('p', { class: 'welcome-lead', text: count.earned + ' of ' + count.total + ' earned so far (' + count.pct + '%). The list on the left is grouped by act in the order this guide suggests.' }));

  const grid = el('div', { class: 'stat-grid' });
  for (const entry of roadmapGroups(sortTrophies(state.trophies, 'order'))) {
    const list = entry[1];
    const earned = list.filter((trophy) => isEarned(trophy.id)).length;
    const pct = list.length ? Math.round((earned / list.length) * 100) : 0;
    const row = el('div', { class: 'act-row' });
    row.append(el('span', { class: 'act-name', text: actTitle(entry[0]) + ' · ' + list.length + ' trophies' }));
    row.append(el('span', { class: 'act-count', text: earned + '/' + list.length }));
    row.append(el('div', { class: 'mini-bar' }, el('span', { class: 'mini-fill', style: { width: pct + '%' } })));
    grid.append(row);
  }
  wrap.append(grid);
  return wrap;
}

/* -------------------------------- the keyboard ----------------------------- */

function onKeydown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  const tag = target && target.tagName ? target.tagName : '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(target && target.isContentEditable);
  const key = event.key;

  if (key === '/' && !typing) {
    event.preventDefault();
    if (dom.search) {
      dom.search.focus();
      dom.search.select();
    }
    return;
  }

  if (key === 'Escape') {
    if (state.filters.q) {
      event.preventDefault();
      state.filters.q = '';
      if (dom.search) dom.search.value = '';
      render();
    } else if (typing && target !== dom.sort && typeof target.blur === 'function') {
      target.blur();
    }
    return;
  }

  if (typing) {
    if (key === 'Enter' && target === dom.search) {
      event.preventDefault();
      openSelected();
    }
    return;
  }

  if (key === 'j' || key === 'k') {
    event.preventDefault();
    moveSelection(key === 'j' ? 1 : -1);
    return;
  }
  if (key === 'Enter') {
    event.preventDefault();
    openSelected();
    return;
  }
  if (key === 'e' || key === 'E') {
    event.preventDefault();
    toggleEarnedSelected();
  }
}

function openSelected() {
  const current = state.selectedId === null ? null : state.byId.get(String(state.selectedId));
  if (!current) {
    const pool = state.view === 'roadmap' ? sortTrophies(state.trophies, 'order') : visibleTrophies();
    if (pool.length) selectTrophy(pool[0].id);
    return;
  }
  if (state.view !== 'detail') selectTrophy(current.id);
  if (dom.detail && typeof dom.detail.focus === 'function') dom.detail.focus({ preventScroll: true });
}

function toggleEarnedSelected() {
  const current = state.selectedId === null ? null : state.byId.get(String(state.selectedId));
  if (!current) return;
  setEarned(current.id, !isEarned(current.id));
  render();
}

/* --------------------------- export / import / reset ----------------------- */

function exportProgress() {
  const payload = JSON.stringify({
    game: state.game,
    exported: new Date().toISOString(),
    progress: state.progress,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = el('a', { href: url, download: 'gta6-trophy-progress.json' });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importProgress(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const source = parsed && typeof parsed === 'object' && parsed.progress && typeof parsed.progress === 'object'
        ? parsed.progress
        : parsed;
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('not a progress file');
      const next = {};
      for (const key of Object.keys(source)) if (source[key]) next[key] = true;
      state.progress = next;
      saveProgress();
      render();
    } catch (err) {
      window.alert('That file could not be imported: ' + (err && err.message ? err.message : err));
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function resetProgress() {
  if (!window.confirm('Clear every earned tick? This cannot be undone.')) return;
  state.progress = {};
  saveProgress();
  render();
}

/* ---------------------------------- loading -------------------------------- */

function loadData() {
  return fetch(DATA_URL, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    })
    .catch(() => readLocalFile())
    .then((text) => {
      if (!text) throw new Error('data/trophies.json came back empty');
      applyData(JSON.parse(text));
    });
}

/* Some browsers only allow fetch() on http(s); this is the one-file fallback
 * used when the folder is opened straight from disk. */
function readLocalFile() {
  return new Promise((resolve, reject) => {
    try {
      const request = new XMLHttpRequest();
      request.open('GET', DATA_URL, true);
      request.onload = () => {
        if (request.status === 0 || (request.status >= 200 && request.status < 300)) resolve(request.responseText);
        else reject(new Error('HTTP ' + request.status));
      };
      request.onerror = () => reject(new Error('could not open ' + DATA_URL));
      request.send();
    } catch (err) {
      reject(err);
    }
  });
}

function normalizeTrophy(raw, index) {
  const trophy = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
  if (trophy.id === undefined || trophy.id === null || trophy.id === '') trophy.id = 't' + (index + 1);
  trophy.name = fmt(trophy.name) || 'Unknown trophy';
  trophy.description = fmt(trophy.description);
  const grade = String(trophy.grade || '').trim().toLowerCase();
  trophy.grade = GRADES.includes(grade) ? grade : 'bronze';
  trophy.hidden = truthy(trophy.hidden);
  trophy.missable = truthy(trophy.missable);
  trophy.difficulty = Number(trophy.difficulty) || 0;
  const order = Number(trophy.order);
  trophy.order = Number.isFinite(order) ? order : index + 1;
  trophy.prereqs = Array.isArray(trophy.prereqs) ? trophy.prereqs : (trophy.prereqs ? [trophy.prereqs] : []);
  trophy.steps = Array.isArray(trophy.steps) ? trophy.steps : (trophy.steps ? [trophy.steps] : []);
  trophy.tips = Array.isArray(trophy.tips) ? trophy.tips : (trophy.tips ? [trophy.tips] : []);
  return trophy;
}

function applyData(data) {
  if (!data || typeof data !== 'object') throw new Error('trophies.json is not an object');
  state.game = fmt(data.game) || state.game;
  state.platform = fmt(data.platform);
  state.updated = fmt(data.updated);
  state.listNote = typeof data.list === 'string' ? data.list : '';
  state.categories = data.categories && typeof data.categories === 'object' && !Array.isArray(data.categories)
    ? data.categories
    : {};
  const raw = Array.isArray(data.trophies) ? data.trophies
    : Array.isArray(data.list) ? data.list
      : Array.isArray(data) ? data
        : [];
  if (!raw.length) throw new Error('trophies.json holds no trophies');
  state.trophies = sortTrophies(raw.map(normalizeTrophy), 'order');
  state.byId = new Map();
  state.byName = new Map();
  for (const trophy of state.trophies) {
    state.byId.set(String(trophy.id), trophy);
    state.byName.set(String(trophy.name).trim().toLowerCase(), trophy);
  }
}

function renderLoadError(err) {
  const message = String(window.location.protocol) === 'file:'
    ? 'Browsers refuse to read data/trophies.json from a file:// page. Serve this folder over http instead (for example: node serve.ts, then http://localhost:8080).'
    : 'Could not load ' + DATA_URL + ': ' + (err && err.message ? err.message : err);
  if (dom.listHead) dom.listHead.textContent = 'Data unavailable';
  if (dom.list) clear(dom.list);
  if (dom.detail) {
    clear(dom.detail);
    dom.detail.append(el('div', { class: 'welcome' },
      el('h2', { class: 'welcome-title', text: 'The trophy list could not be loaded' }),
      el('p', { class: 'body-text', text: message })
    ));
  }
}

/* ---------------------------------- wiring --------------------------------- */

function grabDom() {
  dom.gameName = $('#game-name');
  dom.platformLine = $('#platform-line');
  dom.progressPct = $('#progress-pct');
  dom.progressFill = $('#progress-fill');
  dom.progressBar = $('#progress-bar');
  dom.progressMeta = $('#progress-meta');
  dom.search = $('#search');
  dom.sort = $('#sort');
  dom.gradeChips = $('#grade-chips');
  dom.categoryChips = $('#category-chips');
  dom.toggleChips = $('#toggle-chips');
  dom.counters = $('#counters');
  dom.listHead = $('#list-head');
  dom.list = $('#list');
  dom.empty = $('#empty');
  dom.detail = $('#pane-detail');
  dom.exportBtn = $('#export-btn');
  dom.importInput = $('#import-input');
  dom.resetBtn = $('#reset-btn');
}

function wireEvents() {
  if (dom.search) {
    dom.search.addEventListener('input', () => {
      state.filters.q = dom.search.value;
      render();
    });
  }
  if (dom.sort) {
    dom.sort.addEventListener('change', () => {
      state.filters.sort = SORTS.includes(dom.sort.value) ? dom.sort.value : 'order';
      render();
    });
  }
  if (dom.exportBtn) dom.exportBtn.addEventListener('click', exportProgress);
  if (dom.resetBtn) dom.resetBtn.addEventListener('click', resetProgress);
  if (dom.importInput) dom.importInput.addEventListener('change', importProgress);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', () => {
    applyRoute(parseRoute());
    render();
  });
}

async function boot() {
  const route = parseRoute();
  grabDom();
  try {
    await loadData();
  } catch (err) {
    renderLoadError(err);
    return;
  }
  const stored = readStoredProgress();
  if (stored) state.progress = stored;
  else if (paramBool(route.params.get('demo'))) seedDemo();
  applyRoute(route);
  renderChips();
  wireEvents();
  render();
}

boot();
