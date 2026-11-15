
let PALS_SPECIES = [];
const WORK_CATS = ["Kindling","Watering","Planting","Generating Electricity","Handiwork","Gathering","Lumbering","Mining","Medicine Production","Cooling","Transporting","Farming"];
const ELEMENT_COLOR = {
  Fire:"#ff6b4a", Water:"#4ab3ff", Grass:"#6ad66a", Electric:"#ffd24a",
  Ice:"#8fe3ff", Ground:"#c9975a", Dark:"#9b7bd6", Dragon:"#ff7bd6", Neutral:"#b8bec9"
};
let byId = {};

// In-game work suitability icons (cdn.paldb.cc, T_icon_palwork_NN); index order verified visually.
const WORK_ICON_IDX = {"Kindling":0,"Watering":1,"Planting":2,"Generating Electricity":3,"Handiwork":4,"Gathering":5,"Lumbering":6,"Mining":7,"Medicine Production":8,"Oil Extraction":9,"Cooling":10,"Transporting":11,"Farming":12};
function workIcon(cat, n, plain){
  const i = WORK_ICON_IDX[cat];
  const img = i === undefined ? cat : `<img src="https://cdn.paldb.cc/image/Pal/Texture/UI/InGame/T_icon_palwork_${String(i).padStart(2,'0')}.webp" alt="${cat}" title="${cat}">`;
  return `<span class="wk">${img}${n != null ? `<b>${n}</b>` : ''}</span>`;
}
function workIcons(obj, joiner = ''){
  return Object.entries(obj || {}).filter(([,n]) => n).map(([k,n]) => workIcon(k, n)).join(joiner);
}

function setSpeciesData(list){
  PALS_SPECIES = list;
  byId = Object.fromEntries(PALS_SPECIES.map(p => [p.slug, p]));
}

let unlockedTechs = null; // Set of unlocked technology names; null = unknown (no data from the save)
function setUnlockedTechs(list){ unlockedTechs = list && list.length ? new Set(list) : null; }
// A saddle is unlocked through the "SkillUnlock_<CharacterID>" technology.
function saddleLocked(p){
  return !!(unlockedTechs && p && p.mountSpeed && p.id && !unlockedTechs.has('SkillUnlock_' + p.id));
}

// 'possible' = rank every Pal that has a saddle in the game; 'available' = only those whose saddle I've unlocked.
let mountMode = 'possible';
try { if (localStorage.getItem('paldexMountMode') === 'available') mountMode = 'available'; } catch (e) {}
const mountCounts = p => !!p.mountSpeed && !(mountMode === 'available' && saddleLocked(p));

let owned = []; // every Pal imported from the save

function imgUrl(p){ return `https://paldb.gg/pal/${p.id}.webp`; }

function elementTags(p){
  return (p.elements||[]).map(e => `<span class="tag" style="border-color:${ELEMENT_COLOR[e]||'#555'};color:${ELEMENT_COLOR[e]||'#ccc'}">${e}</span>`).join(' ') || '<span class="dash">—</span>';
}

function isLockedInBase(p){
  return !!(p._real && /^base-\d+$/.test(p._real.location || ''));
}

function locationLabel(location){
  if (!location) return '';
  if (location === 'team') return 'Time';
  if (location === 'palbox') return 'Pal Box';
  const m = /^base-(\d+)$/.exec(location);
  return m ? `Base ${m[1]}` : location;
}

function groupKey(p){ return p._real ? p._real.location : '_manual'; }

function groupSortRank(key){
  if (key === 'team') return -1;
  if (key === 'palbox') return 1e6;
  if (key === '_manual') return Infinity;
  const m = /^base-(\d+)$/.exec(key);
  return m ? Number(m[1]) : Infinity - 1;
}

function groupLabel(key){
  return key === '_manual' ? 'Adicionados manualmente' : (locationLabel(key) || key);
}

function chipHtml(p){
  return `
    <span class="chip" data-slug="${p.slug}">
      <img src="${imgUrl(p)}" alt="">
      ${p.name}
    </span>`;
}

function renderChips(){
  const c = document.getElementById('chips');
  const groups = new Map();
  owned.forEach(p => {
    const key = groupKey(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  const orderedKeys = [...groups.keys()].sort((a, b) => groupSortRank(a) - groupSortRank(b));
  c.innerHTML = orderedKeys.map(key => key === 'palbox' ? `
    <details class="chip-group chip-collapsible">
      <summary class="chip-group-label">${groupLabel(key)} (${groups.get(key).length})</summary>
      <div class="chip-group-items">${groups.get(key).map(chipHtml).join('')}</div>
    </details>` : `
    <div class="chip-group">
      <div class="chip-group-label">${groupLabel(key)}</div>
      <div class="chip-group-items">${groups.get(key).map(chipHtml).join('')}</div>
    </div>`).join('');
}

function fmt(n){ return n===null||n===undefined ? '<span class="dash">—</span>' : (typeof n==='number' ? n.toLocaleString('pt-BR') : n); }

function bestOf(vals){ return Math.max(...vals.filter(v => typeof v === 'number')); }

function groupBySpecies(list){
  const groups = new Map();
  list.forEach(p => {
    const key = p.slug && !p._unknownSpecies ? p.slug : Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return [...groups.values()].map(g => {
    if (g.length === 1) return g[0];
    const rep = g.slice().sort((a,b) => ((b._real||{}).level||0) - ((a._real||{}).level||0))[0];
    const locs = {};
    g.forEach(p => { const l = p._real ? p._real.location : '_manual'; locs[l] = (locs[l]||0) + 1; });
    return { ...rep, _count: g.length, _locs: locs };
  });
}

function computeVerdict(pals = owned){
  const combat = pals.map(p => p.combat);
  // Mount speed is per species, so collapse duplicate species into one entry (keeping the highest-level copy).
  const mountable = groupBySpecies(pals.filter(mountCounts));
  const base = pals.map(p => Object.values(p.work||{}).reduce((a,b)=>a+b,0));

  function winnerBlock(values, names, unit, noneLabel, items){
    const valid = values.map((v,i)=>({v, name:names[i], pal: items && items[i]})).filter(x => typeof x.v === 'number');
    if (valid.length===0) return {winner:null, detail: noneLabel};
    const max = Math.max(...valid.map(x=>x.v));
    const winners = valid.filter(x=>x.v===max).map(x=>x.name);
    const tie = winners.length>1 || winners.length===valid.length && new Set(valid.map(x=>x.v)).size===1;
    const sorted = valid.slice().sort((a,b)=>b.v-a.v);
    return {
      top: sorted.slice(0,5).map(x=>({pal:x.pal, v:x.v})),
      winnerPals: valid.filter(x=>x.v===max).slice(0,5).map(x=>x.pal),
      winner: new Set(valid.map(x=>x.v)).size<=1 ? null : winners.join(' & '),
      detail: sorted.slice(0,5).map(x=>`${x.name} ${x.v.toLocaleString('pt-BR')}${unit||''}`).join(' · ')
    };
  }

  const combatV = winnerBlock(combat, pals.map(p=>p.name), '', undefined, pals);
  const baseV = winnerBlock(base, pals.map(p=>p.name), '', undefined, pals);
  const mountNames = mountable.map(p=>p.name);
  const mountVals = mountable.map(p=>p.mountSpeed);
  const noMount = pals.filter(p=>!p.mountSpeed).map(p=>p.name);
  let mountV;
  if (mountable.length===0){
    mountV = {winner:null, detail:'Nenhum Pal selecionado tem sela nos arquivos.'};
  } else {
    mountV = winnerBlock(mountVals, mountNames, '', undefined, mountable);
  }

  const mountByType = {};
  for (const t of Object.keys(MOUNT_TYPES)){
    const group = mountable.filter(p => mountKind(p) === t);
    if (group.length) mountByType[t] = winnerBlock(group.map(p=>p.mountSpeed), group.map(p=>p.name), '', undefined, group);
  }

  return {combatV, mountV, mountByType, baseV};
}

// Mount type isn't in the species data; classified by hand (base slug, variants share the type).
const MOUNT_TYPES = { air:'Melhor montaria aérea', land:'Melhor montaria terrestre', water:'Melhor montaria aquática' };
const AIR_MOUNTS = new Set(['beakon','celesdir','eidrolon','elphidran','hartalis','helzephyr','maraith','nitewing','quivern','ragnahawk','roujay','selyne','shadowbeak','shaolong','suzaku','vanwyrm','xenolord']);
const WATER_MOUNTS = new Set(['azurobe','ghangler','jormuntide','neptilius','solmora','surfent','whalaska']);
function mountKind(p){
  const base = String(p.slug||'').split('-')[0];
  if (p.slug === 'faleris-aqua') return 'water';
  if (AIR_MOUNTS.has(base)) return 'air';
  if (WATER_MOUNTS.has(base)) return 'water';
  return 'land';
}

let tipPals = [];

function tipReason(p, label){
  if (/combate/i.test(label)) return `Ataque ${p.attack} + Vida ${p.hp}÷2 + Defesa ${p.defense}÷2`;
  if (/montaria/i.test(label)) return `Velocidade de sela ${fmt(p.mountSpeed)}`;
  const total = Object.values(p.work||{}).reduce((a,b)=>a+b,0);
  return `Soma das aptidões: <span class="wk-line">${workIcons(p.work, '<i>+</i>')}</span> = ${total}`;
}

// Explanation shown in the secondary tooltip over the (bold) metric row.
function whyHtml({p, why}){
  const label = why.label.replace(/^Melhor/, 'melhor');
  const head = why.win
    ? `🏆 ${why.tie ? 'Empatado como melhor' : 'É o melhor'} — ${label}`
    : `#${why.rank} de ${why.total} — ${label}`;
  return `<b>${head}</b><small>${tipReason(p, why.label)}</small>`;
}

function tipHtml({p, v, metric, why, locked}){
  const r = p._real || {};
  const work = `<span class="wk-line">${workIcons(p.workDisplay || p.work)}</span>`;
  const rows = [
    [why ? `<b class="metric-name" data-why="1">${why.win ? '🏆 ' : ''}${metric}</b>` : metric, why ? `<b>${fmt(v)}</b>` : fmt(v)],
    r.level ? [p._count ? 'Nível (melhor cópia)' : 'Nível', r.level + (r.nickname ? ` · "${r.nickname}"` : '')] : null,
    p._count ? ['No seu save', `${p._count}× — ` + Object.entries(p._locs).map(([l,n]) => `${groupLabel(l)} ${n}`).join(', ')] : null,
    r.location ? [p._count ? 'Local (melhor cópia)' : 'Local', locationLabel(r.location)] : null,
    ['HP / Atq / Def', [p.hp,p.attack,p.defense].map(x => x ?? '—').join(' / ')],
    p.mountSpeed ? ['Montaria', `${fmt(p.mountSpeed)} (${{air:'aérea',land:'terrestre',water:'aquática'}[mountKind(p)]})`] : null,
    Object.values(p.workDisplay || p.work || {}).some(Boolean) ? ['Trabalho', work] : null,
    r.talentHp != null ? ['IVs HP/Atq/Def', `${r.talentHp} / ${r.talentShot} / ${r.talentDefense}`] : null,
    (r.passiveSkills||[]).length ? ['Passivas', r.passiveSkills.join(', ')] : null,
    p.partnerSkill ? ['Partner Skill', p.partnerSkill] : null,
  ].filter(Boolean);
  const lockBadge = locked ? `<div class="tip-badge nosaddle">🚫 Sela não desbloqueada<small>Você ainda não desbloqueou a sela deste Pal (SkillUnlock_${p.id}).</small></div>` : '';
  return `<div class="tip-title"><img src="${imgUrl(p)}" alt="">${p.name} ${elementTags(p)}</div>` +
    lockBadge + rows.map(([k,val]) => `<div class="tip-row"><span>${k}</span><span>${val}</span></div>`).join('');
}

let tipHideTimer = null, tipPinned = false, tipGlobalBound = false;

function setupTooltips(root){
  let tip = document.getElementById('paltip');
  if (!tip){
    tip = document.createElement('div'); tip.id = 'paltip'; document.body.appendChild(tip);
    // Interactive: stays open while the pointer is over it, so text can be selected / scrolled.
    tip.onmouseenter = () => clearTimeout(tipHideTimer);
    tip.onmouseleave = () => scheduleHide();
  }
  let sub = document.getElementById('paltip-why');
  if (!sub){ sub = document.createElement('div'); sub.id = 'paltip-why'; document.body.appendChild(sub); }
  const hideSub = () => { sub.style.display = 'none'; };
  const hide = () => { tip.style.display = 'none'; hideSub(); tip.classList.remove('pinned'); tipPinned = false; };
  const showSub = (target) => {
    const data = tipPals[Number(tip.dataset.idx)];
    if (!data || !data.why) return;
    sub.className = data.why.win ? 'win' : '';
    sub.innerHTML = whyHtml(data);
    sub.style.display = 'block';
    const r = target.getBoundingClientRect(), s = sub.getBoundingClientRect();
    let top = r.top - s.height - 6;
    if (top < 4) top = r.bottom + 6;
    let left = Math.max(4, Math.min(r.left, window.innerWidth - s.width - 4));
    sub.style.top = top + 'px'; sub.style.left = left + 'px';
  };
  tip.onmouseover = (e) => { const t = e.target.closest('[data-why]'); if (t) showSub(t); };
  tip.onmouseout = (e) => { if (e.target.closest('[data-why]')) hideSub(); };
  const scheduleHide = () => { clearTimeout(tipHideTimer); if (!tipPinned) tipHideTimer = setTimeout(hide, 180); };
  tip.onmouseleave = scheduleHide;

  const show = (el) => {
    clearTimeout(tipHideTimer);
    tip.dataset.idx = el.dataset.tip;
    hideSub();
    tip.innerHTML = tipHtml(tipPals[Number(el.dataset.tip)]);
    tip.style.display = 'block';
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let top = r.top - t.height - 4;
    if (top < 4) top = r.bottom + 4;                       // flip below when no room above
    top = Math.max(4, Math.min(top, window.innerHeight - t.height - 4));
    let left = r.left + r.width/2 - t.width/2;
    left = Math.max(4, Math.min(left, window.innerWidth - t.width - 4));
    tip.style.top = top + 'px'; tip.style.left = left + 'px';
  };

  root.querySelectorAll('[data-tip]').forEach(el => {
    el.tabIndex = 0;
    el.onmouseenter = () => { if (!tipPinned) show(el); };
    el.onmouseleave = scheduleHide;
    el.onfocus = () => { if (!tipPinned) show(el); };
    el.onblur = scheduleHide;
    el.onclick = (e) => {            // click pins the tooltip open
      e.stopPropagation();
      show(el); tipPinned = true; tip.classList.add('pinned');
    };
  });

  if (!tipGlobalBound){
    tipGlobalBound = true;
    document.addEventListener('click', (e) => { if (tipPinned && !e.target.closest('#paltip')) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }
}

function renderVerdict(){
  const pool = owned;
  if (pool.length < 1) return '';
  const {combatV, mountV, mountByType, baseV} = computeVerdict(pool);
  tipPals = [];
  const icon = (p, cls, v, metric, why) => {
    if (!p) return '';
    tipPals.push({p, v, metric, why});
    const locked = metric === 'Velocidade de montaria' && saddleLocked(p);
    if (locked) tipPals[tipPals.length-1].locked = true;
    return `<span class="picon ${cls}${locked ? ' locked' : ''}" data-tip="${tipPals.length-1}">${locked ? '<em class="nosaddle" title="Sela não desbloqueada">🚫</em>' : ''}${p._count ? `<em class="dupe" title="${p._count} cópias">×${p._count}</em>` : ''}<img src="${imgUrl(p)}" alt="${p.name}" loading="lazy">${cls==='sm' && v!=null ? `<b>${fmt(v)}</b>` : ''}</span>`;
  };
  const card = (label, v, metric, total) => {
    const top = v.top || [];
    const rankOf = x => 1 + top.findIndex(y => y.v === x.v);
    const best = top[0] ? top[0].v : null;
    const whyOf = (pal, val, rank) => {
      const win = best != null && val === best && !!v.winner;
      return {label, rank, total, win, tie: win && (v.winnerPals||[]).length > 1};
    };
    return `
    <div class="vcard">
      <div class="label">${label}</div>
      <div class="winner-icons ${v.winner?'':'tie'}">${(v.winnerPals||[]).map(p => icon(p,'lg',best,metric,whyOf(p,best,1))).join('') || '<span class="dash">Sem dados</span>'}${v.winner?'':'<span class="tie-label">Empate</span>'}</div>
      <div class="top-icons">${top.map(x => icon(x.pal,'sm',x.v,metric,whyOf(x.pal,x.v,rankOf(x)))).join('')}</div>
    </div>`;
  };
  const mountCards = Object.keys(mountByType).length
    ? Object.keys(MOUNT_TYPES).filter(t => mountByType[t]).map(t => card(MOUNT_TYPES[t], mountByType[t], 'Velocidade de montaria', groupBySpecies(pool.filter(p=>mountCounts(p) && mountKind(p)===t)).length)).join('')
    : card('Melhor montaria', mountV, 'Velocidade de montaria', groupBySpecies(pool.filter(mountCounts)).length);
  return `<div class="verdict">
    ${card('Melhor para combate', combatV, 'Combate', pool.length)}
    ${mountCards}
    ${card('Melhor trabalhador de base', baseV, 'Aptidão de base', pool.length)}
  </div>`;
}

function setupMountSwitch(){
  const box = document.getElementById('mountSwitch');
  if (!box) return;
  box.style.display = unlockedTechs ? '' : 'none';   // needs unlock data from the save
  box.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === mountMode);
    b.onclick = () => {
      mountMode = b.dataset.mode;
      try { localStorage.setItem('paldexMountMode', mountMode); } catch (e) {}
      render();
    };
  });
}

function render(){
  setupMountSwitch();
  renderChips();
  const main = document.getElementById('main');
  main.innerHTML = owned.length
    ? renderVerdict()
    : '<div class="empty">Nenhum Pal encontrado. O save do Palworld é lido automaticamente; se nada aparecer, use "Forçar".</div>';
  if (typeof document !== 'undefined') setupTooltips(main);
}

if (typeof module !== 'undefined') {
  module.exports = { bestOf, computeVerdict, setSpeciesData, setUnlockedTechs, saddleLocked };
}
