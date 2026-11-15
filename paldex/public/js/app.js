const UNKNOWN_SPECIES_NUMERIC_FIELDS = [
  "hp", "attack", "defense", "stamina", "workSpeed", "mountSpeed",
  "combat", "breedRank", "food", "rarity",
];

function mergeRealPalWithSpecies(realPal, speciesById) {
  const species = speciesById[realPal.character_id];
  let merged;
  if (species) {
    merged = { ...species };
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
    const [speciesResp, palsResp, techsResp] = await Promise.all([
      fetch('/api/species'),
      fetch('/api/pals'),
      fetch('/api/techs'),
    ]);
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
      const [palsR, techsR] = await Promise.all([fetch('/api/pals'), fetch('/api/techs')]);
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
