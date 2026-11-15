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
    const [speciesResp, palsResp] = await Promise.all([
      fetch('/api/species'),
      fetch('/api/pals'),
    ]);
    const species = await speciesResp.json();
    const realPals = await palsResp.json();

    setSpeciesData(species);
    const speciesById = Object.fromEntries(species.map(s => [s.id, s]));
    selected = realPals.map(p => mergeRealPalWithSpecies(p, speciesById));
    render();

    const resyncBtn = document.getElementById('resyncBtn');
    const syncError = document.getElementById('syncError');
    if (resyncBtn) {
      resyncBtn.onclick = async () => {
        if (syncError) syncError.textContent = '';
        const resp = await fetch('/api/resync', { method: 'POST' });
        if (resp.status === 404) {
          if (syncError) syncError.textContent = 'Não encontrei nenhum save do Palworld neste computador.';
          return;
        }
        const freshPals = await resp.json();
        selected = freshPals.map(p => mergeRealPalWithSpecies(p, speciesById));
        render();
      };
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = { mergeRealPalWithSpecies };
}
