
let PALS_SPECIES = [];
// Dados de Pals mantidos à mão vivem em public/pal-rules.json; setPalRules() os carrega aqui.
let WORK_CATS = [], ELEMENT_COLOR = {}, WORK_ICON_IDX = {}, ELEMENT_ICON_IDX = {}, WORK_PT = {}, WORK_BY_LABEL = {};
// Partner Skills oficiais em pt-BR (public/partner-skills.json): id da espécie → {name, desc}.
let PARTNER_PT = {};
function setPartnerSkills(map){ PARTNER_PT = map || {}; }
let PASSIVE_FX = {}, MOUNT_TYPES = {}, AIR_MOUNTS = new Set(), WATER_MOUNTS = new Set(), NON_MOUNTS = new Set(), MOUNT_OVERRIDES = {};
let byId = {};

// In-game work suitability icons (cdn.paldb.cc, T_icon_palwork_NN); index order verified visually.
function workIcon(cat, n, plain){
  const i = WORK_ICON_IDX[cat];
  const img = i === undefined ? cat : `<img src="https://cdn.paldb.cc/image/Pal/Texture/UI/InGame/T_icon_palwork_${String(i).padStart(2,'0')}.webp" alt="${cat}" title="${cat}">`;
  return `<span class="wk">${img}${n != null ? `<b>${n}</b>` : ''}</span>`;
}
function workIcons(obj, joiner = ''){
  return Object.entries(obj || {}).filter(([,n]) => n).map(([k,n]) => workIcon(k, n)).join(joiner);
}

function setPalRules(rules){
  WORK_CATS = rules.work.map(w => w.id);
  WORK_ICON_IDX = Object.fromEntries(rules.work.map(w => [w.id, w.icon]));
  WORK_PT = Object.fromEntries(rules.work.map(w => [w.id, w.pt]));
  WORK_BY_LABEL = Object.fromEntries(WORK_CATS.map(c => ['Melhor em ' + WORK_PT[c], c]));
  ELEMENT_COLOR = rules.elements.colors;
  ELEMENT_ICON_IDX = rules.elements.iconIndex;
  PASSIVE_FX = Object.fromEntries(Object.entries(rules.passives).filter(([k]) => !k.startsWith('_')));
  MOUNT_TYPES = rules.mounts.typeLabels;
  AIR_MOUNTS = new Set(rules.mounts.air);
  WATER_MOUNTS = new Set(rules.mounts.water);
  NON_MOUNTS = new Set(rules.mounts.nonMounts);
  MOUNT_OVERRIDES = rules.mounts.overrides || {};
}

function setSpeciesData(list){
  PALS_SPECIES = list;
  byId = Object.fromEntries(PALS_SPECIES.map(p => [p.slug, p]));
}

let unlockedTechs = null; // Set of unlocked technology names; null = unknown (no data from the save)
function setUnlockedTechs(list){ unlockedTechs = list && list.length ? new Set(list) : null; }
// A saddle is unlocked through the "SkillUnlock_<CharacterID>" technology.
function saddleLocked(p){
  return !!(unlockedTechs && isMount(p) && p.id &&!unlockedTechs.has('SkillUnlock_' + p.id));
}

// 'possible' = rank every Pal that has a saddle in the game; 'available' = only those whose saddle I've unlocked.
let mountMode = 'possible';
try { if (localStorage.getItem('paldexMountMode') === 'available') mountMode = 'available'; } catch (e) {}
const mountCounts = p => isMount(p) && !(mountMode === 'available' && saddleLocked(p));

// Velocidade exibida nos cards de montaria (global): 'sprint' = corrida (Ride sprint), 'run' = normal (Run).
let speedMode = 'sprint';
try { const s = localStorage.getItem('paldexSpeedMode'); if (s === 'run' || s === 'reach') speedMode = s; } catch (e) {}

let owned = []; // every Pal imported from the save

// Ícone oficial de Alfa do jogo (T_icon_enemy_strong), do mesmo CDN dos outros ícones.
const ALPHA_ICON = '<img class="alpha-ico" src="https://cdn.paldb.cc/image/Pal/Texture/UI/InGame/T_icon_enemy_strong.webp" alt="Alfa">';
const ALPHA_BADGE = `<em class="alpha" title="Pal alfa (chefe)">${ALPHA_ICON}</em>`;
function imgUrl(p){ return `https://paldb.gg/pal/${p.id}.webp`; }

// In-game element icons (cdn.paldb.cc, T_Icon_element_NN); index order verified visually.
function elementTags(p){
  return (p.elements||[]).map(e => {
    const i = ELEMENT_ICON_IDX[e];
    if (i === undefined) return `<span class="tag" style="border-color:${ELEMENT_COLOR[e]||'#555'};color:${ELEMENT_COLOR[e]||'#ccc'}">${e}</span>`;
    return `<img class="el" src="https://cdn.paldb.cc/image/Pal/Texture/UI/Main_Menu/T_Icon_element_${String(i).padStart(2,'0')}.webp" alt="${e}" title="${e}">`;
  }).join(' ') || '<span class="dash">—</span>';
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
  tipPals.push({p});   // sem métrica: o tooltip mostra só os dados do Pal
  return `<span class="picon sm" data-slug="${p.slug}" data-tip="${tipPals.length-1}" aria-label="${p.name}">${p._alpha ? ALPHA_BADGE : ''}<img src="${imgUrl(p)}" alt="${p.name}" loading="lazy"></span>`;
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

// Per-copy stats: IV de ataque (talentShot, 0-100) dá +0.3% por ponto; bônus de trabalho vem de workDisplay.
// Efeitos das passivas (pal-rules.json → passives): atk/def = ataque/defesa, work = velocidade de trabalho, move = velocidade de movimento (frações).
function passiveBonus(p, key){
  return ((p._real||{}).passiveSkills || []).reduce((s, id) => s + ((PASSIVE_FX[id]||{})[key] || 0), 0);
}
function passiveNames(p, key){
  return ((p._real||{}).passiveSkills || []).filter(id => (PASSIVE_FX[id]||{})[key]).map(id => `${PASSIVE_FX[id].name} ${PASSIVE_FX[id][key] > 0 ? '+' : ''}${Math.round(PASSIVE_FX[id][key]*100)}%`);
}
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
// Baliza de comparação: nível do jogador (lido do save). Todos os Pals são comparados como se estivessem nesse nível,
// então Pal de nível alto não ganha só por ter mais nível. Sem o nível (null), cai nos valores base da espécie.
let playerLevel = null;
function setPlayerLevel(n){ playerLevel = Number.isFinite(n) && n > 0 ? n : null; }
// Fórmulas de status do Palworld no nível L, com IV (0-100 → +0,3% por ponto) e condensação (rank 1 = 0 estrelas; +5% por estrela).
function iv(p, key){ return 1 + ((p._real||{})[key] || 0) * 0.003; }
function condense(p){ return 1 + (Math.max(1, (p._real||{}).rank || 1) - 1) * 0.05; }
function hpOf(p){ return p.hp == null ? null : playerLevel == null ? p.hp : Math.floor((500 + 5 * playerLevel + p.hp * 0.5 * playerLevel * iv(p, 'talentHp')) * condense(p)); }
function atkOf(p){
  if (p.attack == null) return null;
  const base = playerLevel == null ? p.attack * iv(p, 'talentShot') : (100 + p.attack * 0.075 * playerLevel * iv(p, 'talentShot')) * condense(p);
  return base * (1 + passiveBonus(p, 'atk'));
}
function defOf(p){
  if (p.defense == null) return null;
  const base = playerLevel == null ? p.defense : (50 + p.defense * 0.075 * playerLevel * iv(p, 'talentDefense')) * condense(p);
  return base * (1 + passiveBonus(p, 'def'));
}
// Combate: sem o nível do jogador, a soma antiga. Com ele, média geométrica ∛(ataque × HP × defesa):
// ataque = dano causado; HP × defesa = quanto aguenta. Pesa os três proporcionalmente (a soma deixava o HP dominar).
function combatOf(p){
  if (playerLevel == null) return p.combat == null ? null : r1(p.combat + (atkOf(p) - p.attack) + ((defOf(p) ?? 0) - (p.defense ?? 0)) / 2);
  if (p.attack == null || p.hp == null || p.defense == null) return null;
  return r1(Math.cbrt(atkOf(p) * hpOf(p) * defOf(p)));
}
function workLevel(p, cat){ return (p.workDisplay || p.work || {})[cat] || 0; }
// Pontuação de aptidão: nível × velocidade de trabalho das passivas (ex.: Artesão +50% → ×1,5).
// Transporte também conta a velocidade de movimento das passivas (o Pal anda mais rápido entre o depósito e a base).
function workSpeedMult(p, cat){ return (1 + passiveBonus(p, 'work')) * (cat === 'Transporting' ? 1 + passiveBonus(p, 'move') : 1); }
function workScore(p, cat){ return r1(workLevel(p, cat) * workSpeedMult(p, cat)); }
function mountSpeedOf(p){ return p.mountSpeed == null ? null : Math.round(p.mountSpeed * (1 + passiveBonus(p, 'move'))); }
function mountRunOf(p){ return p.mountRunSpeed == null ? null : Math.round(p.mountRunSpeed * (1 + passiveBonus(p, 'move'))); }
// Alcance = distância relativa até o fôlego acabar na corrida (velocidade × fôlego, ÷1000). Supõe gasto de fôlego igual entre espécies
// (o taxa de consumo não está nos dados); a velocidade normal (run) não gasta fôlego, então não entra.
function reachOf(p){ const s = mountSpeedOf(p); return s == null || p.stamina == null ? null : Math.round(s * p.stamina / 1000); }
const workLabel = cat => 'Melhor em ' + WORK_PT[cat];
function workOf(p){ return Object.values(p.workDisplay || p.work || {}).reduce((a,b)=>a+b,0); }

// Agrupa cópias da mesma espécie; extraKey separa cópias cujo atributo relevante à métrica difere.
function groupBySpecies(list, extraKey){
  const groups = new Map();
  list.forEach(p => {
    const key = p.slug && !p._unknownSpecies ? (extraKey ? p.slug + '|' + extraKey(p) : p.slug) : Symbol();
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
  // Combat, mount and base values are all per species, so collapse duplicate species into one entry (keeping the highest-level copy).
  // Cada card agrupa pelo atributo que ele mede: combate→ataque (IV), base→aptidões, montaria→velocidade.
  const combatPals = groupBySpecies(pals, combatOf);
  const basePals = groupBySpecies(pals, workOf);
  const mountable = groupBySpecies(pals.filter(mountCounts), mountSpeedOf);
  const combat = combatPals.map(combatOf);
  const base = basePals.map(workOf);

  function winnerBlock(values, names, unit, noneLabel, items){
    const valid = values.map((v,i)=>({v, name:names[i], pal: items && items[i]})).filter(x => typeof x.v === 'number');
    if (valid.length===0) return {winner:null, detail: noneLabel};
    const max = Math.max(...valid.map(x=>x.v));
    const winners = valid.filter(x=>x.v===max).map(x=>x.name);
    const tie = winners.length>1 || winners.length===valid.length && new Set(valid.map(x=>x.v)).size===1;
    const sorted = valid.slice().sort((a,b)=>b.v-a.v);
    return {
      // Cópias de outro nível/nota da mesma espécie do vencedor não ocupam vaga no top (a tela as esconderia).
      top: sorted.filter(x => x.v===max || !x.pal || !valid.some(w => w.v===max && w.pal && w.pal.slug===x.pal.slug))
                 .slice(0,3).map(x=>({pal:x.pal, v:x.v})),
      winnerPals: valid.filter(x=>x.v===max).slice(0,5).map(x=>x.pal),
      winner: new Set(valid.map(x=>x.v)).size<=1 ? null : winners.join(' & '),
      detail: sorted.slice(0,3).map(x=>`${x.name} ${x.v.toLocaleString('pt-BR')}${unit||''}`).join(' · ')
    };
  }

  const combatV = winnerBlock(combat, combatPals.map(p=>p.name), '', undefined, combatPals);
  const baseV = winnerBlock(base, basePals.map(p=>p.name), '', undefined, basePals);
  // Um ranking por aptidão de trabalho (só Pals que têm a aptidão); cópias separadas pelo nível da aptidão.
  const workByCat = {};
  for (const cat of WORK_CATS) {
    const hasCat = pals.filter(p => workLevel(p, cat) > 0);
    if (!hasCat.length) continue;
    const group = groupBySpecies(hasCat, p => workScore(p, cat));
    const v = winnerBlock(group.map(p => workScore(p, cat)), group.map(p => p.name), '', undefined, group);
    v.total = group.length;
    workByCat[cat] = v;
  }
  const mountNames = mountable.map(p=>p.name);
  const mountVals = mountable.map(mountSpeedOf);
  let mountV;
  if (mountable.length===0){
    mountV = {winner:null, detail:'Nenhum Pal selecionado tem sela nos arquivos.'};
  } else {
    mountV = winnerBlock(mountVals, mountNames, '', undefined, mountable);
  }

  const mountByType = {};
  for (const t of Object.keys(MOUNT_TYPES)){
    const group = mountable.filter(p => mountKind(p) === t);
    if (!group.length) continue;
    // corrida = Ride sprint (mountSpeed); normal = Run (mountRunSpeed, ausente em dados antigos)
    mountByType[t] = {
      sprint: winnerBlock(group.map(mountSpeedOf), group.map(p=>p.name), '', undefined, group),
      reach: group.some(p => p.stamina != null) ? winnerBlock(group.map(reachOf), group.map(p=>p.name), '', undefined, group) : null,
      run: group.some(p => p.mountRunSpeed) ? winnerBlock(group.map(mountRunOf), group.map(p=>p.name), '', undefined, group) : null,
    };
  }

  return {combatV, mountV, mountByType, baseV, workByCat};
}

// Mount type isn't in the species data; classified by hand (base slug, variants share the type).
const MOUNT_REACH = 'Alcance (velocidade × fôlego)', MOUNT_SPRINT = 'Velocidade de montaria (corrida)', MOUNT_RUN = 'Velocidade de montaria (normal)';
// Têm velocidade de montaria nos dados do jogo, mas não são montarias (ex.: Foxparks é arma/lança-chamas).
function isMount(p){
  return !!(p && p.mountSpeed) && !NON_MOUNTS.has(String(p.slug||'').split('-')[0]);
}
function mountKind(p){
  const base = String(p.slug||'').split('-')[0];
  if (MOUNT_OVERRIDES[p.slug]) return MOUNT_OVERRIDES[p.slug];
  if (AIR_MOUNTS.has(base)) return 'air';
  if (WATER_MOUNTS.has(base)) return 'water';
  return 'land';
}

let tipPals = [];

function tipReason(p, label){
  const fx = (...ks) => { const n = ks.flatMap(k => passiveNames(p, k)); return n.length ? `<br>Passivas: ${n.join(', ')}` : ''; };
  const lv = (p._real||{}).level;
  const levelNote = playerLevel != null && lv && lv !== playerLevel
    ? `<br><i class="lvl-note">⚠ Nível atual deste Pal: ${lv}. O valor é a projeção para quando ele ${lv < playerLevel ? 'chegar' : 'estiver'} no nível ${playerLevel} (o seu), para a comparação ser justa.</i>` : '';
  if (/combate/i.test(label)) return (playerLevel != null ? `No nível ${playerLevel} (o seu) · ` : '') + (playerLevel != null ? `∛(Ataque ${fmt(r1(atkOf(p)))} × Vida ${fmt(hpOf(p))} × Defesa ${fmt(r1(defOf(p)))})` : `Ataque ${fmt(r1(atkOf(p)))} + Vida ${p.hp}÷2 + Defesa ${fmt(r1(defOf(p)))}÷2`) + (((p._real||{}).rank || 1) > 1 && playerLevel != null ? `<br>Condensação: +${((p._real.rank - 1) * 5)}% nos três` : '') + fx('atk', 'def') + levelNote;
  if (/alcance/i.test(label)) return `Corrida ${fmt(mountSpeedOf(p))} × fôlego ${fmt(p.stamina)} ÷ 1000 = ${fmt(reachOf(p))}<br>Quanto maior, mais longe ele corre antes de cansar.` + fx('move');
  if (/montaria/i.test(label)) return (/normal/i.test(label) ? `Velocidade normal (run) ${fmt(mountRunOf(p))}` : `Velocidade de corrida (ride sprint) ${fmt(mountSpeedOf(p))}`) + fx('move');
  const wc = WORK_BY_LABEL[label];
  if (wc) return `Nível de ${WORK_PT[wc]}: ${workLevel(p, wc)} × velocidade (${fmt(r1(workSpeedMult(p, wc)))}) = ${fmt(workScore(p, wc))}` + (wc === 'Transporting' ? fx('work', 'move') : fx('work'));
  const total = workOf(p);
  return `Soma das aptidões: <span class="wk-line">${workIcons(p.workDisplay || p.work, '<i>+</i>')}</span> = ${total}`;
}

// Explanation shown in the secondary tooltip over the (bold) metric row.
function whyHtml({p, why}){
  const label = why.label.replace(/^Melhor/, 'melhor');
  const head = why.win
    ? `🏆 ${why.tie ? 'Empatado como melhor' : 'É o melhor'} — ${label}`
    : `#${why.rank} de ${why.total} — ${label}`;
  return `<b>${head}</b><small>${tipReason(p, why.label)}</small>`;
}

function partnerSkillHtml(p){
  const ps = PARTNER_PT[p.id];
  return ps ? `<span class="passive" data-pskill="${p.id}">${ps.name}</span>` : p.partnerSkill;
}

function tipHtml({p, v, metric, why, locked}){
  const r = p._real || {};
  const work = `<span class="wk-line">${workIcons(p.workDisplay || p.work)}</span>`;
  const rows = [
    metric ? [why ? `<b class="metric-name" data-why="1">${why.win ? '🏆 ' : ''}${metric}</b>` : metric, why ? `<b>${fmt(v)}</b>` : fmt(v)] : null,
    r.level ? [p._count ? 'Nível (melhor cópia)' : 'Nível', r.level + (r.nickname ? ` · "${r.nickname}"` : '')] : null,
    p._count ? ['No seu save', `${p._count}× — ` + Object.entries(p._locs).map(([l,n]) => `${groupLabel(l)} ${n}`).join(', ')] : null,
    r.location ? [p._count ? 'Local (melhor cópia)' : 'Local', locationLabel(r.location)] : null,
    p.stamina != null ? ['Fôlego', fmt(p.stamina)] : null,
    ['HP / Atq / Def', [p.hp,p.attack,p.defense].map(x => x ?? '—').join(' / ')],
    isMount(p) ? ['Montaria', `corrida ${fmt(p.mountSpeed)}${p.mountRunSpeed ? ' · normal ' + fmt(p.mountRunSpeed) : ''} (${{air:'aérea',land:'terrestre',water:'aquática'}[mountKind(p)]})`] : null,
    Object.values(p.workDisplay || p.work || {}).some(Boolean) ? ['Trabalho', work] : null,
    r.talentHp != null ? ['IVs HP/Atq/Def', `${r.talentHp} / ${r.talentShot} / ${r.talentDefense}`] : null,
    (r.passiveSkills||[]).length ? ['Passivas', r.passiveSkills.map(id => PASSIVE_FX[id] ? `<span class="passive" data-pdesc="${id}">${PASSIVE_FX[id].name}</span>` : id).join(', ')] : null,
    p.partnerSkill ? ['Habilidade de companheiro', partnerSkillHtml(p), 'stack'] : null,
  ].filter(Boolean);
  const lockBadge = locked ? `<div class="tip-badge nosaddle">🚫 Sela não desbloqueada<small>Você ainda não desbloqueou a sela deste Pal (SkillUnlock_${p.id}).</small></div>` : '';
  return `<div class="tip-title"><img src="${imgUrl(p)}" alt="">${p.name}${p._alpha ? ` <span class="alpha-tag" title="Pal alfa (chefe)">${ALPHA_ICON}</span>` : ''} ${elementTags(p)}</div>` +
    lockBadge + rows.map(([k,val,cls]) => `<div class="tip-row${cls ? ' ' + cls : ''}"><span>${k}</span><span>${val}</span></div>`).join('');
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
  // Popover de passiva: nome + linhas do efeito (pal-rules.json → passives[id].desc), no mesmo balão secundário.
  const showPassive = (target) => {
    const fx = PASSIVE_FX[target.dataset.pdesc];
    if (!fx) return;
    sub.className = '';
    sub.innerHTML = `<b>${fx.name}</b><small>${(fx.desc || ['Sem descrição.']).join('<br>')}</small>`;
    sub.style.display = 'block';
    const r = target.getBoundingClientRect(), s = sub.getBoundingClientRect();
    let top = r.top - s.height - 6;
    if (top < 4) top = r.bottom + 6;
    sub.style.top = top + 'px'; sub.style.left = Math.max(4, Math.min(r.left, window.innerWidth - s.width - 4)) + 'px';
  };
  // Popover da Partner Skill: nome oficial + descrição pt-BR, no mesmo balão secundário.
  const showPartner = (target) => {
    const ps = PARTNER_PT[target.dataset.pskill];
    if (!ps) return;
    sub.className = '';
    sub.innerHTML = `<b>${ps.name}</b><small>${ps.desc}</small>`;
    sub.style.display = 'block';
    const r = target.getBoundingClientRect(), s = sub.getBoundingClientRect();
    let top = r.top - s.height - 6;
    if (top < 4) top = r.bottom + 6;
    sub.style.top = top + 'px'; sub.style.left = Math.max(4, Math.min(r.left, window.innerWidth - s.width - 4)) + 'px';
  };
  tip.onmouseover = (e) => { const t = e.target.closest('[data-why]'); if (t) return showSub(t); const q = e.target.closest('[data-pdesc]'); if (q) return showPassive(q); const w = e.target.closest('[data-pskill]'); if (w) showPartner(w); };
  tip.onmouseout = (e) => { if (e.target.closest('[data-why],[data-pdesc],[data-pskill]')) hideSub(); };
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

function labelIcon(label){
  if (WORK_BY_LABEL[label]) return workIcon(WORK_BY_LABEL[label]) + (WORK_BY_LABEL[label] === 'Transporting' ? '<span class="bolt" title="Transporte + velocidade">⚡</span>' : '');
  let i = /alcance/i.test(label) ? '🔋'
    : /combate/i.test(label) ? '⚔️'
    : /aérea/i.test(label) ? '🪽'
    : /terrestre/i.test(label) ? '🐎'
    : /aquática/i.test(label) ? '🌊'
    : /trabalhador|base/i.test(label) ? '🔨'
    : /montaria/i.test(label) ? '🐎' : '';
  if (/alcance/i.test(label)) return i + (/aérea/i.test(label) ? '🪽' : /aquática/i.test(label) ? '🌊' : '🐎');
  if (/montaria/i.test(label)) i += /normal/i.test(label) ? '🚶' : /corrida/i.test(label) ? '💨' : '';
  return i;
}

function shortLabel(label){
  if (WORK_BY_LABEL[label]) return WORK_PT[WORK_BY_LABEL[label]];
  if (/montaria|alcance/i.test(label)) {
    const t = /aérea/i.test(label) ? 'Aérea' : /terrestre/i.test(label) ? 'Terrestre' : /aquática/i.test(label) ? 'Aquática' : 'Montaria';
    return t;
  }
  if (/combate/i.test(label)) return 'Combate';
  if (/trabalhador|base/i.test(label)) return 'Base';
  return label;
}

function renderVerdict(){
  const pool = owned;
  if (pool.length < 1) return '';
  const {combatV, mountV, mountByType, workByCat} = computeVerdict(pool);
  tipPals = [];
  const icon = (p, cls, v, metric, why) => {
    if (!p) return '';
    tipPals.push({p, v, metric, why});
    const locked = /^(Velocidade de montaria|Alcance)/.test(metric || '') && saddleLocked(p);
    if (locked) tipPals[tipPals.length-1].locked = true;
    return `<span class="picon ${cls}${locked ? ' locked' : ''}" data-tip="${tipPals.length-1}">${p._alpha ? ALPHA_BADGE : ''}${locked ? '<em class="nosaddle" title="Sela não desbloqueada">🚫</em>' : ''}${p._count ? `<em class="dupe" title="${p._count} cópias">×${p._count}</em>` : ''}<img src="${imgUrl(p)}" alt="${p.name}" loading="lazy">${(cls==='sm' || cls==='lg') && v!=null ? `<b>${fmt(v)}</b>` : ''}</span>`;
  };
  // Switcher corrida/normal/alcance dentro do card de montaria; o estado (speedMode) é global e vale para todos os cards.
  const speedToggle = (mode, hasReach) => `<div class="speed-seg" role="group" aria-label="Critério de montaria">`
    + [['sprint','Corrida','💨'], ['run','Normal','🚶'], ['reach','Alcance','🔋']]
        .filter(([m]) => m !== 'reach' || hasReach)
        .map(([m, t, i]) => `<button type="button" data-speed="${m}" class="${mode===m?'on':''}" title="${t}">${i}</button>`).join('')
    + `</div>`;
  const card = (label, v, metric, total, speedUi) => {
    const top = v.top || [];
    const rankOf = x => 1 + top.findIndex(y => y.v === x.v);
    const best = top[0] ? top[0].v : null;
    const whyOf = (pal, val, rank) => {
      const win = best != null && val === best && !!v.winner;
      return {label, rank, total, win, tie: win && (v.winnerPals||[]).length > 1};
    };
    return `
    <div class="vcard">
      ${speedUi ? speedToggle(speedUi.mode, speedUi.hasReach) : ''}
      <div class="label" title="${label}"><span class="label-ico">${labelIcon(label)}</span>${shortLabel(label)}</div>
      <div class="winner-icons ${v.winner?'':'tie'}">${(v.winnerPals||[]).map(p => icon(p,'lg',best,metric,whyOf(p,best,1))).join('') || '<span class="dash">Sem dados</span>'}${v.winner?'':'<span class="tie-label">Empate</span>'}</div>
      <div class="top-icons">${top.filter(x => !(v.winnerPals||[]).some(w => w === x.pal || (w && x.pal && w.slug === x.pal.slug))).map(x => icon(x.pal,'sm',x.v,metric,whyOf(x.pal,x.v,rankOf(x)))).join('')}</div>
    </div>`;
  };
  const mountCards = Object.keys(mountByType).length
    ? Object.keys(MOUNT_TYPES).filter(t => mountByType[t]).map(t => {
        const total = groupBySpecies(pool.filter(p=>mountCounts(p) && mountKind(p)===t)).length;
        const m = mountByType[t];
        // Um card por tipo; o modo escolhe o critério. Sem dados do modo (cache antigo): cai para corrida.
        const mode = speedMode === 'reach' && m.reach ? 'reach' : speedMode === 'run' && m.run ? 'run' : 'sprint';
        const spec = {
          reach: [' · alcance', m.reach, MOUNT_REACH],
          run: [' · normal', m.run, MOUNT_RUN],
          sprint: [' · corrida', m.sprint, MOUNT_SPRINT],
        }[mode];
        return card(MOUNT_TYPES[t] + spec[0], spec[1], spec[2], total, {mode, hasReach: !!m.reach});
      }).join('')
    : card('Melhor montaria · corrida', mountV, MOUNT_SPRINT, groupBySpecies(pool.filter(mountCounts)).length, {mode: 'sprint', hasReach: false});
  return `<div class="verdict">
    ${card('Melhor para combate', combatV, 'Combate', groupBySpecies(pool, combatOf).length)}
    ${mountCards}
    ${Object.entries(workByCat).map(([cat, v]) => card(workLabel(cat), v, 'Aptidão: ' + WORK_PT[cat], v.total)).join('')}
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

// Os botões ficam dentro dos cards (re-renderizados a cada render); qualquer um muda o modo de todos.
function setupSpeedSwitch(){
  document.querySelectorAll('.speed-seg button').forEach(b => {
    b.onclick = () => {
      speedMode = b.dataset.speed;
      try { localStorage.setItem('paldexSpeedMode', speedMode); } catch (e) {}
      render();
    };
  });
}

function render(){
  setupMountSwitch();
  tipPals = [];
  const main = document.getElementById('main');
  // Veredito primeiro: ele zera tipPals; os chips continuam a numeração depois.
  main.innerHTML = owned.length
    ? renderVerdict()
    : '<div class="empty">Nenhum Pal encontrado. O save do Palworld é lido automaticamente; se nada aparecer, use "Forçar".</div>';
  setupSpeedSwitch();   // depois do innerHTML: os botões vivem dentro dos cards
  renderChips();
  if (typeof document !== 'undefined') setupTooltips(document);
}

if (typeof module !== 'undefined') {
  module.exports = { setPartnerSkills, bestOf, computeVerdict, setSpeciesData, setPalRules, setUnlockedTechs, saddleLocked, setPlayerLevel };
}
