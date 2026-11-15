
let PALS_SPECIES = [];
const WORK_CATS = ["Kindling","Watering","Planting","Generating Electricity","Handiwork","Gathering","Lumbering","Mining","Medicine Production","Cooling","Transporting","Farming"];
const ELEMENT_COLOR = {
  Fire:"#ff6b4a", Water:"#4ab3ff", Grass:"#6ad66a", Electric:"#ffd24a",
  Ice:"#8fe3ff", Ground:"#c9975a", Dark:"#9b7bd6", Dragon:"#ff7bd6", Neutral:"#b8bec9"
};
let byId = {};

function setSpeciesData(list){
  PALS_SPECIES = list;
  byId = Object.fromEntries(PALS_SPECIES.map(p => [p.slug, p]));
}

let selected = [];

function imgUrl(p){ return `https://paldb.gg/pal/${p.id}.webp`; }

function elementTags(p){
  return (p.elements||[]).map(e => `<span class="tag" style="border-color:${ELEMENT_COLOR[e]||'#555'};color:${ELEMENT_COLOR[e]||'#ccc'}">${e}</span>`).join(' ') || '<span class="dash">—</span>';
}

function locationLabel(location){
  if (!location) return '';
  if (location === 'team') return 'Time';
  const m = /^base-(\d+)$/.exec(location);
  return m ? `Base ${m[1]}` : location;
}

function renderChips(){
  const c = document.getElementById('chips');
  c.innerHTML = selected.map(p => `
    <span class="chip" data-slug="${p.slug}">
      <img src="${imgUrl(p)}" alt="">
      ${p.name}
      ${p._real ? `<span class="tag loc-tag">${locationLabel(p._real.location)}</span>` : ''}
      <button data-remove="${p.slug}" title="Remover">✕</button>
    </span>`).join('');
  c.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = () => { selected = selected.filter(p => p.slug !== btn.dataset.remove); render(); };
  });
}

function renderPicker(filter){
  const list = document.getElementById('palList');
  const q = (filter||'').toLowerCase();
  const already = new Set(selected.map(p=>p.slug));
  const items = PALS_SPECIES.filter(p => !already.has(p.slug) && p.name.toLowerCase().includes(q));
  list.innerHTML = items.map(p => `
    <div class="pal-item" data-slug="${p.slug}">
      <img src="${imgUrl(p)}" alt="" loading="lazy">
      <span>${p.name}</span>
      <span class="dash" style="margin-left:auto">${p.dex}</span>
    </div>`).join('') || '<div class="pal-item dash">Nenhum Pal encontrado</div>';
  list.querySelectorAll('.pal-item[data-slug]').forEach(el => {
    el.onclick = () => {
      selected.push(byId[el.dataset.slug]);
      document.getElementById('dropdown').classList.remove('open');
      document.getElementById('searchInput').value='';
      render();
    };
  });
}

function fmt(n){ return n===null||n===undefined ? '<span class="dash">—</span>' : (typeof n==='number' ? n.toLocaleString('pt-BR') : n); }

function bestOf(vals){ return Math.max(...vals.filter(v => typeof v === 'number')); }

function statRow(label, getter, opts={}){
  const vals = selected.map(getter);
  const numeric = vals.map(v => typeof v === 'number' ? v : null);
  const best = bestOf(numeric.filter(v=>v!==null));
  const allTie = numeric.every(v => v===null) || new Set(numeric.filter(v=>v!==null)).size <= 1;
  return `<tr><td class="rowlabel">${label}</td>${selected.map((p,i)=>{
    const v = vals[i];
    if (typeof v !== 'number') return `<td>${fmt(v)}</td>`;
    const pct = best>0 ? Math.max(4, Math.round(v/best*100)) : 0;
    const isBest = !allTie && v===best;
    return `<td><div class="bar-wrap"><div class="bar-fill ${isBest?'best':''}" style="width:${pct}%"></div><div class="bar-text">${fmt(v)}</div></div></td>`;
  }).join('')}</tr>`;
}

function computeVerdict(pals = selected){
  const combat = pals.map(p => p.combat);
  const mountable = pals.filter(p => p.mountSpeed);
  const base = pals.map(p => Object.values(p.work||{}).reduce((a,b)=>a+b,0));

  function winnerBlock(values, names, unit, noneLabel){
    const valid = values.map((v,i)=>({v, name:names[i]})).filter(x => typeof x.v === 'number');
    if (valid.length===0) return {winner:null, detail: noneLabel};
    const max = Math.max(...valid.map(x=>x.v));
    const winners = valid.filter(x=>x.v===max).map(x=>x.name);
    const tie = winners.length>1 || winners.length===valid.length && new Set(valid.map(x=>x.v)).size===1;
    const sorted = valid.slice().sort((a,b)=>b.v-a.v);
    return {
      winner: new Set(valid.map(x=>x.v)).size<=1 ? null : winners.join(' & '),
      detail: sorted.map(x=>`${x.name} ${x.v.toLocaleString('pt-BR')}${unit||''}`).join(' · ')
    };
  }

  const combatV = winnerBlock(combat, pals.map(p=>p.name), '');
  const baseV = winnerBlock(base, pals.map(p=>p.name), '');
  const mountNames = mountable.map(p=>p.name);
  const mountVals = mountable.map(p=>p.mountSpeed);
  const noMount = pals.filter(p=>!p.mountSpeed).map(p=>p.name);
  let mountV;
  if (mountable.length===0){
    mountV = {winner:null, detail:'Nenhum Pal selecionado tem sela nos arquivos.'};
  } else {
    mountV = winnerBlock(mountVals, mountNames, '');
    if (noMount.length) mountV.detail += (mountV.detail?' · ':'') + noMount.map(n=>`${n} sem sela`).join(', ');
  }

  return {combatV, mountV, baseV};
}

function renderVerdict(){
  if (selected.length < 2) return '';
  const {combatV, mountV, baseV} = computeVerdict();
  const card = (label, v) => `
    <div class="vcard">
      <div class="label">${label}</div>
      <div class="winner ${v.winner?'':'tie'}">${v.winner || 'Empate / sem dados'}</div>
      <div class="detail">${v.detail}</div>
    </div>`;
  return `<div class="verdict">
    ${card('Melhor para combate', combatV)}
    ${card('Melhor montaria', mountV)}
    ${card('Melhor trabalhador de base', baseV)}
  </div>
  <div class="formula">Combate = ataque + vida÷2 + defesa÷2 · Montaria = velocidade de sela (precisa de sela) · Base = soma de todos os níveis de trabalho.</div>`;
}

function renderTable(){
  if (selected.length === 0) return '';
  const header = `<tr><th class="rowlabel"></th>${selected.map(p => `
    <th class="pal-col-head">
      <button class="remove" data-remove="${p.slug}">✕</button>
      <img class="pimg" src="${imgUrl(p)}" alt="">
      <div class="pname">${p.name}</div>
      <div class="dash">${p.dex}</div>
    </th>`).join('')}</tr>`;

  const elementsRow = `<tr><td class="rowlabel">Elementos</td>${selected.map(p=>`<td>${elementTags(p)}</td>`).join('')}</tr>`;
  const rarityRow = statRow('Raridade', p=>p.rarity);
  const combatRow = statRow('Combate (calculado)', p=>p.combat);
  const hpRow = statRow('HP', p=>p.hp);
  const atkRow = statRow('Ataque', p=>p.attack);
  const defRow = statRow('Defesa', p=>p.defense);
  const stamRow = statRow('Stamina', p=>p.stamina);
  const workSpeedRow = statRow('Velocidade de trabalho', p=>p.workSpeed);
  const mountRow = statRow('Velocidade de montaria', p=>p.mountSpeed);
  const foodRow = statRow('Comida por refeição', p=>p.food);
  const breedRow = `<tr><td class="rowlabel">Breed rank (menor = antes)</td>${selected.map(p=>`<td>${fmt(p.breedRank)}</td>`).join('')}</tr>`;
  const noctRow = `<tr><td class="rowlabel">Ativo à noite</td>${selected.map(p=>`<td>${p.nocturnal?'Noite':'Dia'}</td>`).join('')}</tr>`;
  const skillRow = `<tr><td class="rowlabel">Partner Skill</td>${selected.map(p=>`<td>${p.partnerSkill||'<span class="dash">—</span>'}</td>`).join('')}</tr>`;
  const dropsRow = `<tr><td class="rowlabel">Drops</td>${selected.map(p=>`<td>${(p.drops||[]).join(', ')||'<span class="dash">—</span>'}</td>`).join('')}</tr>`;

  const baseTotalRow = statRow('Total de aptidão de base', p=>Object.values(p.work||{}).reduce((a,b)=>a+b,0));
  const workRows = WORK_CATS.map(cat => statRow(cat, p => { const src = p.workDisplay || p.work; return (src && src[cat]) || null; })).join('');

  return `
  <div class="section-title">Visão geral</div>
  <table><thead>${header}</thead><tbody>
    ${elementsRow}${rarityRow}${combatRow}${noctRow}${skillRow}
  </tbody></table>

  <div class="section-title">Combate &amp; mobilidade</div>
  <table><tbody>
    ${hpRow}${atkRow}${defRow}${stamRow}${workSpeedRow}${mountRow}
  </tbody></table>

  <div class="section-title">Base &amp; funções de trabalho</div>
  <table><tbody>
    ${baseTotalRow}${workRows}
  </tbody></table>

  <div class="section-title">Outros</div>
  <table><tbody>
    ${foodRow}${breedRow}${dropsRow}
  </tbody></table>
  `;
}

function sortSelected(){
  const mode = document.getElementById('sortSelect').value;
  if (mode==='name') selected.sort((a,b)=>a.name.localeCompare(b.name));
  if (mode==='combat') selected.sort((a,b)=>b.combat-a.combat);
  if (mode==='mount') selected.sort((a,b)=>(b.mountSpeed||0)-(a.mountSpeed||0));
  if (mode==='base') selected.sort((a,b)=>{
    const sb = s=>Object.values(s.work||{}).reduce((x,y)=>x+y,0);
    return sb(b)-sb(a);
  });
}

function render(){
  sortSelected();
  renderChips();
  const main = document.getElementById('main');
  if (selected.length === 0){
    main.innerHTML = '<div class="empty">Adicione pelo menos 2 Pals para comparar.</div>';
  } else if (selected.length === 1){
    main.innerHTML = renderTable() + '<div class="empty">Adicione mais um Pal para ver o veredito.</div>';
  } else {
    main.innerHTML = renderVerdict() + renderTable();
  }
  main.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = () => { selected = selected.filter(p => p.slug !== btn.dataset.remove); render(); };
  });
  const params = new URLSearchParams();
  if (selected.length) params.set('p', selected.map(p=>p.slug).join(','));
  history.replaceState(null, '', location.pathname + (selected.length ? '?'+params.toString() : ''));
}

if (typeof document !== 'undefined') {
  document.getElementById('addBtn').onclick = (e) => {
    e.stopPropagation();
    const dd = document.getElementById('dropdown');
    dd.classList.toggle('open');
    renderPicker('');
    document.getElementById('searchInput').focus();
  };
  document.getElementById('searchInput').oninput = (e) => renderPicker(e.target.value);
  document.getElementById('sortSelect').onchange = render;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pal-picker')) document.getElementById('dropdown').classList.remove('open');
  });
}

// load from URL ?p=slug1,slug2,... -- called by app.js once species data has
// been injected via setSpeciesData, instead of running as an immediate IIFE
function initFromUrl(){
  const params = new URLSearchParams(location.search);
  const slugs = (params.get('p')||'').split(',').filter(Boolean);
  selected = slugs.map(s => byId[s]).filter(Boolean);
  render();
}

if (typeof module !== 'undefined') {
  module.exports = { bestOf, computeVerdict, setSpeciesData, initFromUrl };
}
