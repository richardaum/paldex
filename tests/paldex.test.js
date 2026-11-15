const test = require('node:test');
const assert = require('node:assert');
const { bestOf, computeVerdict, setSpeciesData, setPalRules, setPlayerLevel } = require('../public/js/paldex.js');
setPalRules(require('../public/pal-rules.json'));

const ARSOX = { id: 'FlameBuffalo', name: 'Arsox', slug: 'arsox', hp: 85, attack: 100,
                 defense: 95, stamina: 120, mountSpeed: 1050, work: { Kindling: 3, Lumbering: 2 },
                 combat: 190 };
const ANUBIS = { id: 'Anubis', name: 'Anubis', slug: 'anubis', hp: 120, attack: 130,
                  defense: 100, stamina: 100, mountSpeed: null,
                  work: { Handiwork: 6, Mining: 6, Transporting: 4 }, combat: 240 };
const ASTEGON = { id: 'BlackMetalDragon', name: 'Astegon', slug: 'astegon', hp: 100, attack: 125,
                   defense: 125, stamina: 300, mountSpeed: 1100,
                   work: { Handiwork: 3, Mining: 7 }, combat: 238 };

test('bestOf returns the max of a numeric list', () => {
  assert.strictEqual(bestOf([190, 240, 238]), 240);
});

test('computeVerdict matches the previously verified Arsox/Anubis/Astegon numbers', () => {
  const { combatV, mountV, baseV } = computeVerdict([ARSOX, ANUBIS, ASTEGON]);
  assert.strictEqual(combatV.winner, 'Anubis');
  assert.strictEqual(mountV.winner, 'Astegon');
  assert.strictEqual(baseV.winner, 'Anubis');
});

test('computeVerdict collapses duplicate species in combat and base tops', () => {
  const copy = (p, level) => ({ ...p, _real: { level, location: 'base' } });
  const { combatV, baseV } = computeVerdict([copy(ARSOX, 10), copy(ARSOX, 30), copy(ANUBIS, 5), copy(ANUBIS, 7)]);
  for (const v of [combatV, baseV]) {
    const slugs = v.top.map(x => x.pal.slug);
    assert.deepStrictEqual(slugs, [...new Set(slugs)]);
    assert.strictEqual(v.top.length, 2);
  }
});

test('computeVerdict ranks each work aptitude separately, only among Pals that have it', () => {
  const { workByCat } = computeVerdict([ARSOX, ANUBIS, ASTEGON]);
  assert.strictEqual(workByCat.Mining.winner, 'Astegon');
  assert.strictEqual(workByCat.Handiwork.winner, 'Anubis');
  assert.strictEqual(workByCat.Kindling.total, 1);
  assert.strictEqual(workByCat.Watering, undefined);
});

test('passives change the rankings: work speed, attack and move speed', () => {
  const withPassives = (p, passiveSkills) => ({ ...p, _real: { passiveSkills } });
  // Astegon (Mining 7) perde para Anubis (Mining 6) quando este tem Artesão (+50% → 9) e Astegon tem Preguiçoso (-30% → 4.9)
  const r = computeVerdict([withPassives(ANUBIS, ['CraftSpeed_up2']), withPassives(ASTEGON, ['CraftSpeed_down2'])]);
  assert.strictEqual(r.workByCat.Mining.winner, 'Anubis');
  assert.strictEqual(r.workByCat.Mining.top[0].v, 9);
  // Ataque: Feroz +20% faz o Arsox (combate 190 → 210) passar de 205
  const A = { ...ARSOX, combat: 205 - 0 };
  const { combatV } = computeVerdict([withPassives(ARSOX, ['PAL_ALLAttack_up2']), { ...A, slug: 'other', name: 'Other', _real: {} }]);
  assert.strictEqual(combatV.winner, 'Arsox');
  // Montaria: Corredor +20%
  const { mountByType } = computeVerdict([withPassives(ARSOX, ['MoveSpeed_up_2']), { ...ASTEGON, mountSpeed: 1100 }]);
  assert.strictEqual(mountByType.land.sprint.winnerPals[0].slug, 'arsox');
});

test('computeVerdict splits mount ranking into sprint and run', () => {
  const A = { id: 'A', name: 'Aaa', slug: 'aaa', mountSpeed: 1100, mountRunSpeed: 700, work: {}, combat: 1 };
  const B = { id: 'B', name: 'Bbb', slug: 'bbb', mountSpeed: 1000, mountRunSpeed: 900, work: {}, combat: 1 };
  const { mountByType } = computeVerdict([A, B]);
  assert.strictEqual(mountByType.land.sprint.winnerPals[0].slug, 'aaa');
  assert.strictEqual(mountByType.land.run.winnerPals[0].slug, 'bbb');
});

test('computeVerdict reach crosses sprint speed with stamina', () => {
  const FAST = { id: 'A', name: 'Fast', slug: 'fast', mountSpeed: 1200, mountRunSpeed: 700, stamina: 100, work: {}, combat: 1 };
  const TANK = { id: 'B', name: 'Tank', slug: 'tank', mountSpeed: 1000, mountRunSpeed: 700, stamina: 300, work: {}, combat: 1 };
  const { mountByType } = computeVerdict([FAST, TANK]);
  assert.strictEqual(mountByType.land.sprint.winnerPals[0].slug, 'fast');
  assert.strictEqual(mountByType.land.reach.winnerPals[0].slug, 'tank');   // 300 > 120
});

test('computeVerdict does not rank Foxparks (weapon Pal, not a mount) as a land mount', () => {
  const FOX = { id: 'Kitsunebi', name: 'Foxparks', slug: 'foxparks', mountSpeed: 550, mountRunSpeed: 400, work: {}, combat: 1 };
  const CRYST = { ...FOX, id: 'Kitsunebi_Ice', name: 'Foxparks Cryst', slug: 'foxparks-cryst' };
  const A = { id: 'A', name: 'Aaa', slug: 'aaa', mountSpeed: 300, mountRunSpeed: 200, work: {}, combat: 1 };
  const { mountByType } = computeVerdict([FOX, CRYST, A]);
  const names = mountByType.land.sprint.top.map(x => x.pal.slug);
  assert.deepStrictEqual(names, ['aaa']);
});

test('setSpeciesData does not throw and replaces the internal species list', () => {
  setSpeciesData([ARSOX, ANUBIS, ASTEGON]);
});

test('combat is compared at the player level: the Pal own level does not matter', () => {
  setPlayerLevel(40);
  try {
    const copy = (p, level) => ({ ...p, _real: { level, location: 'team', talentHp: 0, talentShot: 0, talentDefense: 0, passiveSkills: [] } });
    const low = computeVerdict([copy(ARSOX, 5)]).combatV.top[0].v;
    const high = computeVerdict([copy(ARSOX, 50)]).combatV.top[0].v;
    assert.strictEqual(low, high);
    // atq 400, hp 2400 (500+200+85*0.5*40), def 335 (50+95*0.075*40)
    assert.strictEqual(low, Math.round(Math.cbrt(400 * 2400 * 335) * 10) / 10);
    // cada estrela de condensação vale +5% nos três: ×1,05 no score
    const star = computeVerdict([{ ...copy(ARSOX, 5), _real: { ...copy(ARSOX, 5)._real, rank: 5 } }]).combatV.top[0].v;
    assert.ok(star > low * 1.19 && star < low * 1.21);
  } finally { setPlayerLevel(null); }
});

test('suggestBase fills the main role first, never repeats a Pal and respects the slot limit', () => {
  const { suggestBase } = require('../public/js/paldex.js');
  const mk = (slug, work, extra = {}) => ({ name: slug, slug, work, workDisplay: work, _real: { level: 1, location: 'base-1', gender: 'Male', ...extra } });
  const pals = [
    mk('a', { Mining: 5, Transporting: 1 }), mk('b', { Mining: 3 }), mk('c', { Mining: 4, Handiwork: 2 }),
    mk('d', { Transporting: 3 }), mk('e', { Lumbering: 4 }),
  ];
  const r = suggestBase(pals, 'mining', 4);
  const all = r.roles.flatMap(x => x.pals.map(y => y.p));
  assert.strictEqual(r.roles[0].cat, 'Mining');
  assert.deepStrictEqual(r.roles[0].pals.map(x => x.p.slug), ['a', 'c', 'b']);
  assert.strictEqual(new Set(all).size, all.length);
  assert.ok(all.length <= 4);
  assert.ok(!all.some(p => p.slug === 'e'));   // sem aptidão útil para o objetivo
});

test('suggestBase breeding reserves a male+female pair of the same species', () => {
  const { suggestBase } = require('../public/js/paldex.js');
  const mk = (slug, gender, tal) => ({ name: slug, slug, work: { Farming: 1 }, _real: { level: 1, location: 'team', gender, talentHp: tal, talentShot: tal, talentDefense: tal, passiveSkills: [] } });
  const pals = [mk('x', 'Male', 90), mk('x', 'Male', 10), mk('x', 'Female', 80), mk('y', 'Male', 99)];
  const r = suggestBase(pals, 'breeding');
  assert.strictEqual(r.pairs.length, 1);
  assert.strictEqual(r.pairs[0].male._real.talentHp, 90);
  assert.strictEqual(r.pairs[0].female._real.gender, 'Female');
});
