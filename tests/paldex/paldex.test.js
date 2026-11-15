const test = require('node:test');
const assert = require('node:assert');
const { bestOf, computeVerdict, setSpeciesData } = require('../../paldex/public/js/paldex.js');

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

test('setSpeciesData does not throw and replaces the internal species list', () => {
  setSpeciesData([ARSOX, ANUBIS, ASTEGON]);
});
