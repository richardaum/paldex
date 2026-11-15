const UNKNOWN_SPECIES_NUMERIC_FIELDS = [
  "hp", "attack", "defense", "stamina", "workSpeed", "mountSpeed",
  "combat", "breedRank", "food", "rarity",
];

function mergeRealPalWithSpecies(realPal, speciesById) {
  // Alphas vêm no save como BOSS_<Id> (às vezes Boss_<Id>); o seed só tem a espécie base.
  const isAlpha = /^boss_/i.test(realPal.character_id);
  const baseId = isAlpha ? realPal.character_id.replace(/^boss_/i, '') : realPal.character_id;
  const species = speciesById[realPal.character_id] || speciesById[baseId];
  let merged;
  if (species) {
    merged = { ...species };
    if (isAlpha) merged._alpha = true;
  } else {
    merged = { name: realPal.character_id, slug: realPal.instance_id, elements: [], drops: [], work: {} };
    UNKNOWN_SPECIES_NUMERIC_FIELDS.forEach(field => { merged[field] = null; });
    merged._unknownSpecies = true;
  }

  merged.workDisplay = { ...(merged.work || {}) };
  Object.entries(realPal.work_bonus || {}).forEach(([category, bonus]) => {
    merged.workDisplay[category] = (merged.workDisplay[category] || 0) + bonus;
  });

  merged._real = {
    nickname: realPal.nickname,
    level: realPal.level,
    rank: realPal.rank,
    gender: realPal.gender,
    friendship: realPal.friendship,
    talentHp: realPal.talent_hp,
    talentShot: realPal.talent_shot,
    talentDefense: realPal.talent_defense,
    passiveSkills: realPal.passive_skills,
    workBonus: realPal.work_bonus,
    location: realPal.location,
  };

  return merged;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    const [speciesResp, palsResp, techsResp, rulesResp, partnerResp, statusResp] = await Promise.all([
      fetch('/api/species'),
      fetch('/api/pals'),
      fetch('/api/techs'),
      fetch('/pal-rules.json'),
      fetch('/partner-skills.json'),
      fetch('/api/status'),
    ]);
    try { setPlayerLevel((await statusResp.json()).player_level); } catch (e) {}
    setPalRules(await rulesResp.json());
    try { setPartnerSkills(await partnerResp.json()); } catch (e) { /* sem tradução: cai no nome em inglês */ }
    setUnlockedTechs(await techsResp.json());
    const species = await speciesResp.json();
    const realPals = await palsResp.json();

    setSpeciesData(species);
    const speciesById = Object.fromEntries(species.map(s => [s.id, s]));
    owned = realPals.map(p => mergeRealPalWithSpecies(p, speciesById));
    render();

    const resyncBtn = document.getElementById('resyncBtn');
    const syncError = document.getElementById('syncError');
    const syncStatus = document.getElementById('syncStatus');
    let knownVersion = null;

    async function reloadPals() {
      const [palsR, techsR, statusR] = await Promise.all([fetch('/api/pals'), fetch('/api/techs'), fetch('/api/status')]);
      try { setPlayerLevel((await statusR.json()).player_level); } catch (e) {}
      setUnlockedTechs(await techsR.json());
      owned = (await palsR.json()).map(p => mergeRealPalWithSpecies(p, speciesById));
      render();
    }

    function showStatus(status) {
      if (syncStatus) {
        syncStatus.textContent = status.last_sync
          ? 'Sincronizado às ' + new Date(status.last_sync * 1000).toLocaleTimeString('pt-BR')
          : 'Aguardando o save…';
      }
      if (syncError) syncError.textContent = status.error ? 'Erro ao ler o save: ' + status.error : '';
    }

    async function pollStatus() {
      try {
        const status = await (await fetch('/api/status')).json();
        showStatus(status);
        if (knownVersion !== null && status.version !== knownVersion) await reloadPals();
        knownVersion = status.version;
      } catch (e) {
        // server briefly unreachable; try again on the next tick
      }
    }

    // Dropdown de saves: só aparece com 2+ mundos. A escolha fica no localStorage e é reaplicada ao abrir.
    const saveSelect = document.getElementById('saveSelect');
    async function loadSaves() {
      if (!saveSelect) return;
      try {
        const { selected, saves } = await (await fetch('/api/saves')).json();
        saveSelect.innerHTML = saves.map(s =>
          `<option value="${s.id}">${s.name || s.id.replace(/\/Level\.sav$/, '')} · ${new Date(s.mtime * 1000).toLocaleString('pt-BR')}</option>`).join('');
        saveSelect.style.display = saves.length > 1 ? '' : 'none';
        let want = selected;
        try { const k = localStorage.getItem('paldexSave'); if (k && saves.some(s => s.id === k)) want = k; } catch (e) {}
        if (want) saveSelect.value = want;
        if (want && want !== selected) await chooseSave(want);
      } catch (e) {}
    }
    async function chooseSave(id) {
      const resp = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (resp.ok) { await reloadPals(); pollStatus(); }
    }
    if (saveSelect) saveSelect.onchange = () => {
      try { localStorage.setItem('paldexSave', saveSelect.value); } catch (e) {}
      chooseSave(saveSelect.value);
    };
    loadSaves();

    // Banner: há commits mais novos no GitHub (o servidor compara o HEAD local com o remoto).
    (async () => {
      try {
        const u = await (await fetch('/api/update')).json();
        const bar = document.getElementById('updateBanner');
        if (!u.available || !bar) return;
        bar.innerHTML = `⬆️ Há uma versão mais recente no GitHub (<code>${u.local}</code> → <code>${u.remote}</code>). Rode <code>git pull</code> para atualizar. <button type="button" aria-label="Fechar">×</button>`;
        bar.hidden = false;
        bar.querySelector('button').onclick = () => { bar.hidden = true; };
      } catch (e) { /* sem rede/servidor: sem aviso */ }
    })();

    pollStatus();
    setInterval(pollStatus, 5000);

    if (resyncBtn) {
      resyncBtn.onclick = async () => {
        if (syncError) syncError.textContent = '';
        const resp = await fetch('/api/resync', { method: 'POST' });
        if (resp.status === 404) {
          if (syncError) syncError.textContent = 'Não encontrei nenhum save do Palworld neste computador.';
          return;
        }
        if (!resp.ok) {
          pollStatus();
          return;
        }
        await reloadPals();
        pollStatus();
      };
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = { mergeRealPalWithSpecies };
}
