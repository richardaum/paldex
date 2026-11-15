const test = require('node:test');
const assert = require('node:assert');
const { mergeRealPalWithSpecies } = require('../../pal-compare/public/js/app.js');

const SPECIES_BY_ID = {
  FlameBuffalo: { id: 'FlameBuffalo', name: 'Arsox', slug: 'arsox', hp: 85, attack: 100,
                  defense: 95, work: { Kindling: 3, Lumbering: 2 }, combat: 190 },
};

test('merges a known real pal with its species stats', () => {
  const real = { instance_id: 'p1', character_id: 'FlameBuffalo', nickname: 'Bob',
                 level: 12, rank: 2, gender: 'Male', friendship: 500, talent_hp: 80,
                 talent_shot: 90, talent_defense: 70, passive_skills: ['Runner'],
                 work_bonus: { Kindling: 2 }, location: 'team' };
  const merged = mergeRealPalWithSpecies(real, SPECIES_BY_ID);
  assert.strictEqual(merged.name, 'Arsox');
  assert.strictEqual(merged.hp, 85);
  assert.strictEqual(merged._real.nickname, 'Bob');
  assert.strictEqual(merged._real.workBonus.Kindling, 2);
  // display-only boosted value, verdict-facing `work` stays untouched:
  assert.strictEqual(merged.workDisplay.Kindling, 5);
  assert.strictEqual(merged.work.Kindling, 3);
});

test('unknown species falls back to raw character_id without crashing', () => {
  const real = { instance_id: 'p2', character_id: 'SomeFutureDlcPal', nickname: '',
                 level: 1, rank: 1, gender: 'Male', friendship: 0, talent_hp: 1,
                 talent_shot: 1, talent_defense: 1, passive_skills: [], work_bonus: {},
                 location: 'base-1' };
  const merged = mergeRealPalWithSpecies(real, SPECIES_BY_ID);
  assert.strictEqual(merged.name, 'SomeFutureDlcPal');
  assert.strictEqual(merged._unknownSpecies, true);
  assert.strictEqual(merged.hp, null);
});
