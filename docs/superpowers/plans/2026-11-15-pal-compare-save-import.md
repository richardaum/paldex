# Pal Compare — Save Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the standalone `pal-compare.html` into a small local Flask app (`pal-compare/`) that opens already populated with the user's real Team + Base Pals (read from their Palworld save), still lets them add any other species via the existing picker, and can resync its SQLite cache from the save on demand.

**Architecture:** A Python backend (`save_reader.py` + `db.py` + `server.py`) does all save-reading and caching. SQLite is the single source of truth for **both** kinds of Pal data: the 288-species reference dataset (seeded once from a bundled `species_seed.json`) and the real Team+Base Pals (written by `/api/resync`). The existing single-file comparator is split into static `public/` assets (`index.html`, `css/styles.css`, `js/compare.js`) plus a new `js/app.js` that fetches `/api/species` and `/api/pals` on load and drives a "Resincronizar" button against `/api/resync`. No save file is ever written back.

**Tech Stack:** Python 3.12 + Flask (new dependency) + stdlib `sqlite3` + `palworld-save-tools` 0.24.0 + `pyooz` 0.0.8 (both already installed `--user` on this machine) for the backend; plain ES5/ES6 browser JS for the frontend, with Node's built-in `node:test` runner used only at dev time to unit-test the pure JS logic (Node is not a runtime dependency of the shipped app).

**Spec:** `C:\Users\richa\palworld\docs-pal-compare-design.md`

## Global Constraints

- Read-only: never open any `.sav` file in a write mode, never call `compress_gvas_to_sav` or re-encode anything.
- Only Windows is supported; save path is resolved via `%LOCALAPPDATA%\Pal\Saved\SaveGames\<steamid>\<worldid>\Level.sav`, picking the most recently modified `Level.sav` across all `<steamid>/<worldid>` combinations, **excluding** any path containing a `backup` path segment.
- Decode `Level.sav` with `palworld_save_tools` restricted to exactly these two custom property keys (never `"all"`): `.worldSaveData.CharacterSaveParameterMap.Value.RawData` and `.worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData`.
- Two monkeypatches are required before any `palworld_save_tools` call, already proven against the real save in this conversation: (1) `palworld_save_tools.palsav.decompress_sav_to_gvas` must handle magic bytes `b"PlM"` (save_type byte `0x31`) via `ooz.decompress(payload, uncompressed_len)`, in addition to the existing `b"PlZ"` zlib path; (2) `palworld_save_tools.archive.FArchiveReader.eof` must be patched to always return `True`, because every `rawdata/*.py` decoder's `if not reader.eof(): raise` is a stale post-hoc length check against a schema the game has since extended, and we only need read access.
- Pal Box must be fully excluded: among all non-empty containers found in `CharacterContainerSaveData`, the one with the largest slot count is the Pal Box — drop every pal whose `InstanceId` resolves to that container. The 5-slot container is the Team. Every other non-empty container is a Base, numbered `base-1`, `base-2`, ... in the order first encountered while iterating containers.
- Exclude every `CharacterSaveParameterMap` entry where `SaveParameter.value.IsPlayer.value` is truthy.
- The existing verdict formulas (`combat = attack + hp/2 + defense/2`, `mount = mountSpeed` when non-null, `base = sum of species work dict values`) must not change and must keep using **species base stats** (served by `GET /api/species`, sourced from the SQLite `species` table) for every Pal, real or picker-added. Real-pal fields (level, rank, gender, friendship, IVs, passives, nickname, work bonus, location) are additive display-only fields, never inputs to those three formulas.
- Real work suitability shown per category = species base level (from the `species` table) + sum of matching `{WorkSuitability, Rank}` entries in that pal's `GotWorkSuitabilityAddRankList` (default 0 when the list is empty or the category isn't present).
- `requirements.txt` pins: `flask==3.1.3`, `palworld-save-tools==0.24.0`, `pyooz==0.0.8`.
- `data/cache.sqlite3` is gitignored (it's a local cache: both `species` and `pals` tables are reconstructible — `species` from `species_seed.json`, `pals` from `/api/resync` — so losing the file costs nothing but a reseed/resync).
- `C:\Users\richa\palworld\pal-compare.html` and the once-deleted `pals-data.json` are source material only — the 288-species JSON array they contain must end up solely in `pal-compare/species_seed.json` (committed to git, since it's static reference data, not user data), and the old root-level `pal-compare.html` must be removed once migrated (not left duplicated).
- The `species` table is seeded lazily: whenever `db.get_connection` opens a database whose `species` table is empty, it loads `species_seed.json` and inserts all 288 rows before returning the connection. This makes SQLite the one cache for everything, per this change: deleting `data/cache.sqlite3` and restarting the server fully rebuilds both tables (species from the seed file, pals on the next `/api/resync`).

## Review Focus

- No save found at all (fresh machine, `SaveGames` folder absent, or it exists but has zero `Level.sav` anywhere outside `backup/`): `/api/resync` must return a clean 404 with an error message, never a 500 traceback; the frontend must show a friendly inline message instead of a blank page or a silent failure.
- A real pal's `CharacterID` has no match among the cached species (a species not in the paldb.gg dump, e.g. future DLC): the merge must not throw — render it with the raw `CharacterID` as its name and skip the species-derived stat rows instead of crashing the whole comparator.
- A world with zero Team/Base pals (brand new save): the comparator must render an empty/informative "Meus Pals" state, not an error, and "+ Adicionar Pal" must keep working on its own.
- Resync must actually drop pals that no longer exist in the save (released/dead/moved to Box) — a naive upsert-only cache would leave ghost pals forever; the cache write must be a full replace of the Team+Base set each time.
- `GotWorkSuitabilityAddRankList` is absent or empty for the overwhelming majority of pals (only pals that received a specific item/Pal Soul have entries) — the bonus lookup must default to 0 per category without a `KeyError` or `None` arithmetic crash.

---

## File Structure

```
pal-compare/
  server.py
  save_reader.py
  db.py
  species_seed.json          # the 288-species array, committed (static reference data)
  requirements.txt
  README.md
  .gitignore
  data/                      # created at runtime, gitignored (sqlite cache: species + pals)
  public/
    index.html
    css/
      styles.css
    js/
      compare.js
      app.js
tests/
  pal-compare/
    test_db.py
    test_save_reader.py
    test_server.py
    compare.test.js
    app.test.js
```

(Python tests run with `pytest` from `C:\Users\richa\palworld`; JS tests run with `node --test tests/pal-compare/*.test.js`.)

---

### Task 1: SQLite cache layer (`db.py`)

**Files:**
- Create: `pal-compare/db.py`
- Create: `pal-compare/species_seed.json` (the 288-entry array currently embedded in `pal-compare.html`'s `<script id="pals-data">` tag, extracted verbatim — same field names: `id, name, slug, dex, elements, hp, attack, defense, stamina, workSpeed, work, mountSpeed, partnerSkill, breedRank, food, rarity, drops, nocturnal, combat`)
- Test: `tests/pal-compare/test_db.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `get_connection(db_path: str, seed_path: str = "species_seed.json") -> sqlite3.Connection` (seeds the `species` table from `seed_path` on first use, see Step 3), `replace_all_pals(conn: sqlite3.Connection, pals: list[dict]) -> None`, `get_all_pals(conn: sqlite3.Connection) -> list[dict]`, `get_all_species(conn: sqlite3.Connection) -> list[dict]`. A pal dict has exactly these keys: `instance_id: str, character_id: str, nickname: str, level: int, rank: int, gender: str, friendship: int, talent_hp: int, talent_shot: int, talent_defense: int, passive_skills: list[str], work_bonus: dict[str, int], location: str`. A species dict has exactly the 19 keys listed above. These are the keys every later task must use verbatim.

- [ ] **Step 1: Write the failing tests**

```python
# tests/pal-compare/test_db.py
import json
import sqlite3
import sys
sys.path.insert(0, "pal-compare")
from db import get_connection, replace_all_pals, get_all_pals, get_all_species

SAMPLE = [
    {"instance_id": "aaa", "character_id": "Arsox", "nickname": "", "level": 12,
     "rank": 2, "gender": "Male", "friendship": 500, "talent_hp": 80,
     "talent_shot": 90, "talent_defense": 70, "passive_skills": ["Runner"],
     "work_bonus": {"Kindling": 1}, "location": "team"},
    {"instance_id": "bbb", "character_id": "Anubis", "nickname": "Tut",
     "level": 30, "rank": 4, "gender": "Female", "friendship": 100,
     "talent_hp": 60, "talent_shot": 60, "talent_defense": 60,
     "passive_skills": [], "work_bonus": {}, "location": "base-1"},
]

def test_get_connection_creates_schema(tmp_path):
    conn = get_connection(str(tmp_path / "cache.sqlite3"))
    assert get_all_pals(conn) == []

def test_replace_all_pals_round_trips(tmp_path):
    conn = get_connection(str(tmp_path / "cache.sqlite3"))
    replace_all_pals(conn, SAMPLE)
    result = {p["instance_id"]: p for p in get_all_pals(conn)}
    assert result["aaa"]["character_id"] == "Arsox"
    assert result["bbb"]["passive_skills"] == []
    assert result["aaa"]["work_bonus"] == {"Kindling": 1}

def test_replace_all_pals_drops_stale_rows(tmp_path):
    conn = get_connection(str(tmp_path / "cache.sqlite3"))
    replace_all_pals(conn, SAMPLE)
    replace_all_pals(conn, SAMPLE[:1])
    assert [p["instance_id"] for p in get_all_pals(conn)] == ["aaa"]

def test_replace_all_pals_empty_list_clears_cache(tmp_path):
    conn = get_connection(str(tmp_path / "cache.sqlite3"))
    replace_all_pals(conn, SAMPLE)
    replace_all_pals(conn, [])
    assert get_all_pals(conn) == []

SPECIES_FIXTURE = [
    {"id": "FlameBuffalo", "name": "Arsox", "slug": "arsox", "dex": "#058",
     "elements": ["Fire"], "hp": 85, "attack": 100, "defense": 95, "stamina": 120,
     "workSpeed": 100, "work": {"Kindling": 3, "Lumbering": 2}, "mountSpeed": 1050,
     "partnerSkill": "Warm Body", "breedRank": 2320, "food": 3, "rarity": 4,
     "drops": ["Horn", "Flame Organ"], "nocturnal": False, "combat": 190},
]

def test_get_connection_seeds_species_table_on_first_use(tmp_path):
    seed_path = tmp_path / "seed.json"
    seed_path.write_text(json.dumps(SPECIES_FIXTURE))
    conn = get_connection(str(tmp_path / "cache.sqlite3"), seed_path=str(seed_path))
    species = get_all_species(conn)
    assert len(species) == 1
    assert species[0]["slug"] == "arsox"
    assert species[0]["work"] == {"Kindling": 3, "Lumbering": 2}

def test_get_connection_does_not_reseed_species_on_second_open(tmp_path):
    seed_path = tmp_path / "seed.json"
    seed_path.write_text(json.dumps(SPECIES_FIXTURE))
    db_path = str(tmp_path / "cache.sqlite3")
    get_connection(db_path, seed_path=str(seed_path))
    seed_path.write_text(json.dumps(SPECIES_FIXTURE + SPECIES_FIXTURE))  # would be 2 if reseeded
    conn2 = get_connection(db_path, seed_path=str(seed_path))
    assert len(get_all_species(conn2)) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/pal-compare/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 3: Implement `pal-compare/db.py`**

`get_connection(db_path, seed_path="species_seed.json")` opens (creating parent dirs if needed) a `sqlite3.connect(db_path)`, runs `CREATE TABLE IF NOT EXISTS pals (instance_id TEXT PRIMARY KEY, character_id TEXT, nickname TEXT, level INTEGER, rank INTEGER, gender TEXT, friendship INTEGER, talent_hp INTEGER, talent_shot INTEGER, talent_defense INTEGER, passive_skills TEXT, work_bonus TEXT, location TEXT)` and `CREATE TABLE IF NOT EXISTS species (id TEXT PRIMARY KEY, name TEXT, slug TEXT, dex TEXT, elements TEXT, hp INTEGER, attack INTEGER, defense INTEGER, stamina INTEGER, workSpeed INTEGER, work TEXT, mountSpeed INTEGER, partnerSkill TEXT, breedRank INTEGER, food INTEGER, rarity INTEGER, drops TEXT, nocturnal INTEGER, combat INTEGER)`, sets `row_factory = sqlite3.Row`, then — if `SELECT COUNT(*) FROM species` is `0` — reads `seed_path` as JSON and `INSERT`s every entry (list/dict fields `elements`, `work`, `drops` as `json.dumps(...)`; `nocturnal` as `int(bool(...))`), commits, and finally returns the connection. `passive_skills` and `work_bonus` on the `pals` table are likewise stored as `json.dumps(...)` text and decoded back with `json.loads(...)` on read. `replace_all_pals` runs inside one transaction: `DELETE FROM pals` then `INSERT INTO pals VALUES (...)` for every pal, then `conn.commit()` — a full replace, per the Global Constraints note on stale rows (simpler and correct for a "resync" semantic; no need for row-level diffing). `get_all_pals` does `SELECT * FROM pals` and maps each row back to the dict shape above; `get_all_species` does `SELECT * FROM species` and maps each row back, decoding `elements`/`work`/`drops` with `json.loads(...)` and `nocturnal` back to `bool(...)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/pal-compare/test_db.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Extract the real `species_seed.json` from the current `pal-compare.html`**

Run a short one-off Node or Python script that reads `pal-compare.html`, finds the `<script id="pals-data" type="application/json">...</script>` tag's text content, and writes it as `pal-compare/species_seed.json` (pretty-printed or minified, implementer's call). Verify with: `python -c "import json; d=json.load(open('pal-compare/species_seed.json', encoding='utf-8')); print(len(d), d[0]['slug'])"` — expected output starts with `288`.

- [ ] **Step 6: Commit**

```bash
git add pal-compare/db.py pal-compare/species_seed.json tests/pal-compare/test_db.py
git commit -m "feat(pal-compare): add sqlite cache layer for species + real pals"
```

---

### Task 2: Save-data extraction logic (`save_reader.py` — pure part)

**Files:**
- Create: `pal-compare/save_reader.py`
- Test: `tests/pal-compare/test_save_reader.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `extract_pals_from_gvas(gvas: dict) -> list[dict]`, returning dicts with the exact same keys Task 1 defined (`instance_id, character_id, nickname, level, rank, gender, friendship, talent_hp, talent_shot, talent_defense, passive_skills, work_bonus, location`), minus `instance_id`'s formatting constraint (any string is fine, it only needs to be stable/unique — use the raw GVAS `InstanceId.value` string as-is).

This task only covers the pure transformation (GVAS-shaped dict in, list of plain pal dicts out) so it can be unit-tested without any real save file, Oodle, or network/filesystem access. Task 3 covers the decompression/file-finding glue around it.

- [ ] **Step 1: Write the failing tests**

Build a minimal synthetic fixture matching the real shape confirmed earlier in this project (`worldSaveData.CharacterSaveParameterMap.value` as a list of `{key: {InstanceId: {value: <guid>}}, value: {RawData: {value: {object: {SaveParameter: {value: {...fields...}}}}}}}`, and `worldSaveData.CharacterContainerSaveData.value` as a list of `{key: {ID: {value: <guid>}}, value: {Slots: {value: {values: [{RawData: {value: {instance_id: <guid>}}}, ...]}}}}`).

```python
# tests/pal-compare/test_save_reader.py
import sys
sys.path.insert(0, "pal-compare")
from save_reader import extract_pals_from_gvas

def _enum(v):
    return {"value": {"value": v}}

def _byte(v):
    return {"value": {"value": v}}

def _pal(instance_id, character_id, is_player=False, nickname="", level=1,
          rank=1, gender="Male", friendship=0, talents=(1, 1, 1),
          passives=None, work_bonus_entries=None):
    sp = {
        "CharacterID": {"value": character_id},
        "IsPlayer": {"value": is_player},
        "NickName": {"value": nickname},
        "Level": _byte(level),
        "Rank": _byte(rank),
        "Gender": _enum(f"EPalGenderType::{gender}"),
        "FriendshipPoint": {"value": friendship},
        "Talent_HP": _byte(talents[0]),
        "Talent_Shot": _byte(talents[1]),
        "Talent_Defense": _byte(talents[2]),
        "PassiveSkillList": {"value": {"values": passives or []}},
    }
    if work_bonus_entries:
        sp["GotWorkSuitabilityAddRankList"] = {"value": {"values": [
            {"WorkSuitability": _enum(f"EPalWorkSuitability::{cat}"), "Rank": _byte(rank)}
            for cat, rank in work_bonus_entries
        ]}}
    return {
        "key": {"InstanceId": {"value": instance_id}},
        "value": {"RawData": {"value": {"object": {"SaveParameter": {"value": sp}}}}},
    }

def _container(container_id, instance_ids):
    return {
        "key": {"ID": {"value": container_id}},
        "value": {"Slots": {"value": {"values": [
            {"RawData": {"value": {"instance_id": iid}}} for iid in instance_ids
        ]}}},
    }

def _gvas(char_entries, container_entries):
    return {"properties": {"worldSaveData": {"value": {
        "CharacterSaveParameterMap": {"value": char_entries},
        "CharacterContainerSaveData": {"value": container_entries},
    }}}}

ZERO = "00000000-0000-0000-0000-000000000000"

def test_classifies_team_base_and_drops_box():
    chars = [
        _pal("p1", "Arsox"),            # team (5-slot container)
        _pal("p2", "Anubis", work_bonus_entries=[("MonsterFarm", 1)]),  # base-1
        _pal("boxed", "Chikipi"),       # box (largest) -> dropped
        _pal("player1", "Human", is_player=True),  # dropped, is player
    ]
    containers = [
        _container("c-team", ["p1", ZERO, ZERO, ZERO, ZERO]),   # 5 slots -> team
        _container("c-base", ["p2"]),                            # 1 slot -> base-1
        _container("c-box", ["boxed"] * 10),                     # biggest -> Pal Box, dropped
    ]
    result = {p["instance_id"]: p for p in extract_pals_from_gvas(_gvas(chars, containers))}
    assert set(result) == {"p1", "p2"}
    assert result["p1"]["location"] == "team"
    assert result["p2"]["location"] == "base-1"
    assert result["p2"]["work_bonus"] == {"MonsterFarm": 1}

def test_extracts_all_real_pal_fields_with_correct_unwrapping():
    chars = [_pal("p1", "Arsox", nickname="Bob", level=12, rank=2,
                   gender="Female", friendship=500, talents=(80, 90, 70),
                   passives=["Runner", "Lucky"])]
    containers = [_container("c-team", ["p1"])]
    result = extract_pals_from_gvas(_gvas(chars, containers))[0]
    assert result["nickname"] == "Bob"
    assert result["level"] == 12
    assert result["rank"] == 2
    assert result["gender"] == "Female"          # stripped of "EPalGenderType::"
    assert result["friendship"] == 500
    assert result["talent_hp"] == 80
    assert result["talent_shot"] == 90
    assert result["talent_defense"] == 70
    assert result["passive_skills"] == ["Runner", "Lucky"]

def test_pal_with_no_work_bonus_defaults_to_empty_dict():
    chars = [_pal("p1", "Arsox")]
    containers = [_container("c-team", ["p1"])]
    result = extract_pals_from_gvas(_gvas(chars, containers))
    assert result[0]["work_bonus"] == {}

def test_pal_not_in_any_container_is_skipped():
    chars = [_pal("orphan", "Arsox")]
    result = extract_pals_from_gvas(_gvas(chars, []))
    assert result == []

def test_empty_save_returns_empty_list():
    assert extract_pals_from_gvas(_gvas([], [])) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/pal-compare/test_save_reader.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'save_reader'`

- [ ] **Step 3: Implement `extract_pals_from_gvas` in `pal-compare/save_reader.py`**

Build `instance_id -> container_id` by walking `CharacterContainerSaveData.value`, recording each container's slot `instance_id`s (skip the all-zero GUID `"00000000-0000-0000-0000-000000000000"`, it marks an empty slot). Find the container with the most non-zero slots = Pal Box id; the container with exactly 5 non-zero slots = Team id (per Global Constraints — this is the real game's party-size cap, already verified against the user's save: 5/132/11 slot containers mapped exactly to Team/Box/Base). Every other non-empty container is a Base, numbered `base-1`, `base-2`, ... in first-seen order while iterating `CharacterContainerSaveData.value` top to bottom. Then walk `CharacterSaveParameterMap.value`; for each entry read `sp = entry["value"]["RawData"]["value"]["object"]["SaveParameter"]["value"]`; skip if `sp.get("IsPlayer", {}).get("value")` is truthy; skip if its `InstanceId` isn't in the `instance_id -> container_id` map (not in any tracked container) or its container is the Pal Box id. Otherwise emit a dict with the keys from this task's Interfaces block: `character_id = sp["CharacterID"]["value"]`; `nickname = sp.get("NickName", {}).get("value", "")`; `level`/`rank`/`talent_hp`/`talent_shot`/`talent_defense` are `ByteProperty`-shaped (`sp["Level"]["value"]["value"]`, note the double `["value"]["value"]` — confirmed against the real save's JSON shape earlier in this project); `gender` is `EnumProperty`-shaped (`sp["Gender"]["value"]["value"]`, a string like `"EPalGenderType::Female"`) and must be stripped to just the part after `"::"`; `friendship = sp.get("FriendshipPoint", {}).get("value", 0)`; `passive_skills` from `sp["PassiveSkillList"]["value"]["values"]` (default `[]`); `work_bonus` by reducing `sp.get("GotWorkSuitabilityAddRankList", {}).get("value", {}).get("values", [])` into `{category: rank, ...}`, where each entry's category is `entry["WorkSuitability"]["value"]["value"]` likewise stripped after `"::"` and rank is `entry["Rank"]["value"]["value"]` (default `{}` when absent/empty — Review Focus item 5).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/pal-compare/test_save_reader.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pal-compare/save_reader.py tests/pal-compare/test_save_reader.py
git commit -m "feat(pal-compare): classify real pals into team/base/box from GVAS data"
```

---

### Task 3: Save decompression and file discovery (`save_reader.py` — glue)

**Files:**
- Modify: `pal-compare/save_reader.py`
- Test: `tests/pal-compare/test_save_reader.py` (append)

**Interfaces:**
- Consumes: `extract_pals_from_gvas` from Task 2.
- Produces: `decompress_sav_to_gvas(data: bytes) -> tuple[bytes, int]`, `find_latest_level_sav() -> pathlib.Path`, `extract_pals(sav_path: "pathlib.Path | None" = None) -> list[dict]`. `find_latest_level_sav` raises `FileNotFoundError("no Level.sav found")` when nothing matches. `extract_pals` lets that same `FileNotFoundError` propagate (Task 4's route handler is what turns it into a 404).

- [ ] **Step 1: Write the failing tests**

```python
# appended to tests/pal-compare/test_save_reader.py
import struct
import zlib
from pathlib import Path
from unittest.mock import patch

from save_reader import decompress_sav_to_gvas, find_latest_level_sav, extract_pals

def _plz_sav(payload: bytes) -> bytes:
    compressed = zlib.compress(payload)
    return (struct.pack("<II", len(payload), len(compressed))
            + b"PlZ" + bytes([0x31]) + compressed)

def test_decompress_plz_zlib_path():
    gvas, save_type = decompress_sav_to_gvas(_plz_sav(b"GVAS-fake-payload"))
    assert gvas == b"GVAS-fake-payload"
    assert save_type == 0x31

def test_decompress_plm_uses_ooz(monkeypatch):
    calls = {}
    def fake_decompress(payload, uncompressed_len):
        calls["payload"] = payload
        calls["uncompressed_len"] = uncompressed_len
        return b"X" * uncompressed_len
    monkeypatch.setattr("save_reader.ooz.decompress", fake_decompress)
    raw = struct.pack("<II", 10, 3) + b"PlM" + bytes([0x31]) + b"abc"
    gvas, save_type = decompress_sav_to_gvas(raw)
    assert gvas == b"X" * 10
    assert calls == {"payload": b"abc", "uncompressed_len": 10}

def test_find_latest_level_sav_skips_backup_and_picks_newest(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    base = tmp_path / "Pal" / "Saved" / "SaveGames" / "111" / "WORLDA"
    base.mkdir(parents=True)
    (base / "Level.sav").write_bytes(b"old")
    backup = tmp_path / "Pal" / "Saved" / "SaveGames" / "111" / "WORLDB" / "backup" / "world" / "x"
    backup.mkdir(parents=True)
    (backup / "Level.sav").write_bytes(b"ignored")
    newer = tmp_path / "Pal" / "Saved" / "SaveGames" / "222" / "WORLDC"
    newer.mkdir(parents=True)
    (newer / "Level.sav").write_bytes(b"new")
    import os, time
    os.utime(base / "Level.sav", (time.time() - 100, time.time() - 100))
    found = find_latest_level_sav()
    assert found == newer / "Level.sav"

def test_find_latest_level_sav_raises_when_none(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    try:
        find_latest_level_sav()
        assert False, "expected FileNotFoundError"
    except FileNotFoundError:
        pass

def test_extract_pals_raises_when_no_save(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    try:
        extract_pals()
        assert False, "expected FileNotFoundError"
    except FileNotFoundError:
        pass
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/pal-compare/test_save_reader.py -v`
Expected: FAIL (`ImportError` for the three new names)

- [ ] **Step 3: Implement the three functions in `pal-compare/save_reader.py`**

`decompress_sav_to_gvas` is the monkeypatch body from the Global Constraints, defined directly in this module (not patched onto `palsav` yet — Task 3 installs the module-level patch too, see below) with the same parsing as the original `palworld_save_tools.palsav.decompress_sav_to_gvas` for `b"CNK"`/`b"PlZ"`, plus the new `b"PlM"` branch calling `ooz.decompress(payload, uncompressed_len)` (`import ooz` at module top). `find_latest_level_sav` globs `Path(os.environ["LOCALAPPDATA"]) / "Pal" / "Saved" / "SaveGames"` recursively for `Level.sav`, filters out any path with a `"backup"` path part, and returns the max by `.stat().st_mtime`; raises `FileNotFoundError("no Level.sav found")` on an empty result. `extract_pals(sav_path=None)` resolves `sav_path = sav_path or find_latest_level_sav()`, then — **at call time** — applies the two Global-Constraints monkeypatches (`palworld_save_tools.palsav.decompress_sav_to_gvas = decompress_sav_to_gvas` and `palworld_save_tools.archive.FArchiveReader.eof = lambda self: True`; both idempotent, fine to re-apply every call), reads the file bytes, calls `palworld_save_tools.gvas.GvasFile.read(...)` restricted to the two `needed_keys` from Global Constraints, round-trips it to a plain dict via `json.loads(json.dumps(gvas_file.dump(), cls=CustomEncoder))`, and returns `extract_pals_from_gvas(that_dict)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/pal-compare/test_save_reader.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Manual integration check (not automated — needs a real save)**

Run: `python -c "import sys; sys.path.insert(0,'pal-compare'); from save_reader import extract_pals; r = extract_pals(); print(len(r), r[0])"`
Expected: prints `16 {...}` (or whatever the current real Team+Base count is) with no traceback — confirms the proven prototype still works end-to-end once ported into the module. Do not commit any output file containing real save data.

- [ ] **Step 6: Commit**

```bash
git add pal-compare/save_reader.py tests/pal-compare/test_save_reader.py
git commit -m "feat(pal-compare): decompress Oodle saves and locate the latest Level.sav"
```

---

### Task 4: Flask server (`server.py`)

**Files:**
- Create: `pal-compare/server.py`
- Create: `pal-compare/requirements.txt`
- Test: `tests/pal-compare/test_server.py`

**Interfaces:**
- Consumes: `get_connection`, `replace_all_pals`, `get_all_pals`, `get_all_species` from `db.py` (Task 1); `extract_pals` from `save_reader.py` (Task 3).
- Produces: `create_app(db_path: str, seed_path: str = "species_seed.json") -> flask.Flask`. Routes: `GET /api/species` -> 200 JSON list of species dicts; `GET /api/pals` -> 200 JSON list of pal dicts (Task 1's shape); `POST /api/resync` -> 200 JSON list on success, 404 `{"error": "..."}` when `extract_pals` raises `FileNotFoundError`. Static files served from `pal-compare/public/`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/pal-compare/test_server.py
import sys
sys.path.insert(0, "pal-compare")
from server import create_app

SEED_FIXTURE_PATH = "tests/pal-compare/fixtures/species_seed_fixture.json"
# a tiny 1-entry seed file (same shape as test_db.py's SPECIES_FIXTURE) checked
# in alongside the tests, so server tests don't depend on the real 288-entry file

def test_get_pals_empty_before_any_sync(tmp_path):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    client = app.test_client()
    resp = client.get("/api/pals")
    assert resp.status_code == 200
    assert resp.get_json() == []

def test_get_species_returns_seeded_data(tmp_path):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    client = app.test_client()
    resp = client.get("/api/species")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body) == 1
    assert body[0]["slug"] == "arsox"

def test_resync_populates_and_persists(tmp_path, monkeypatch):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    fake_pals = [{"instance_id": "p1", "character_id": "Arsox", "nickname": "",
                  "level": 1, "rank": 1, "gender": "Male", "friendship": 0,
                  "talent_hp": 1, "talent_shot": 1, "talent_defense": 1,
                  "passive_skills": [], "work_bonus": {}, "location": "team"}]
    monkeypatch.setattr("server.extract_pals", lambda: fake_pals)
    client = app.test_client()
    resync_resp = client.post("/api/resync")
    assert resync_resp.status_code == 200
    assert resync_resp.get_json()[0]["character_id"] == "Arsox"
    get_resp = client.get("/api/pals")
    assert get_resp.get_json()[0]["character_id"] == "Arsox"

def test_resync_returns_404_when_no_save_found(tmp_path, monkeypatch):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    def boom():
        raise FileNotFoundError("no Level.sav found")
    monkeypatch.setattr("server.extract_pals", boom)
    client = app.test_client()
    resp = client.post("/api/resync")
    assert resp.status_code == 404
    assert "error" in resp.get_json()

def test_serves_static_index(tmp_path):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    client = app.test_client()
    resp = client.get("/")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/pal-compare/test_server.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 3: Create the test fixture seed file**

Create `tests/pal-compare/fixtures/species_seed_fixture.json` containing a JSON array with exactly the one `SPECIES_FIXTURE` entry from `test_db.py` (Arsox).

- [ ] **Step 4: Implement `pal-compare/server.py` and `pal-compare/requirements.txt`**

`create_app(db_path="data/cache.sqlite3", seed_path="species_seed.json")` builds `Flask(__name__, static_folder="public", static_url_path="")`, opens one `db.get_connection(db_path, seed_path=seed_path)` stored on `app.config["DB_CONN"]`, registers `GET /` returning `app.send_static_file("index.html")`, `GET /api/species` returning `jsonify(get_all_species(conn))`, `GET /api/pals` returning `jsonify(get_all_pals(conn))`, and `POST /api/resync` that calls `extract_pals()` inside a `try/except FileNotFoundError as e: return jsonify({"error": str(e)}), 404`, else `replace_all_pals(conn, pals); return jsonify(pals)`. Add `if __name__ == "__main__": create_app().run(port=5000)` at the bottom. `requirements.txt` contains exactly the three pinned lines from Global Constraints.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pip install -r pal-compare/requirements.txt && pytest tests/pal-compare/test_server.py -v`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add pal-compare/server.py pal-compare/requirements.txt tests/pal-compare/test_server.py tests/pal-compare/fixtures/species_seed_fixture.json
git commit -m "feat(pal-compare): add Flask server with /api/species, /api/pals and /api/resync"
```

---

### Task 5: Split the comparator into `public/` (static refactor + species now injected, not bundled)

**Files:**
- Create: `pal-compare/public/index.html`, `pal-compare/public/css/styles.css`, `pal-compare/public/js/compare.js`
- Test: `tests/pal-compare/compare.test.js`
- Delete: `pal-compare.html` (root)

**Interfaces:**
- Consumes: nothing new (the 288-entry array itself was already extracted into `pal-compare/species_seed.json` by Task 1 — species now reaches the browser over HTTP, not as a bundled file, so this task no longer produces a `data.js`).
- Produces: `js/compare.js` keeps every function from the current single-file version (`imgUrl`, `elementTags`, `renderChips`, `renderPicker`, `fmt`, `bestOf`, `statRow`, `computeVerdict`, `renderVerdict`, `renderTable`, `sortSelected`, `render`, the `addBtn`/`searchInput`/`sortSelect` wiring, and the `init()` IIFE that reads `?p=` from the URL) unchanged in behavior, but the module-level `const PALS = JSON.parse(...)` (which used to read the inline `<script id="pals-data">` tag) becomes `let PALS_SPECIES = [];` plus a new exported `setSpeciesData(list)` that assigns `PALS_SPECIES = list` and rebuilds whatever `id`-keyed lookup object the picker/`init()` code uses (so it stays correct after species arrive asynchronously instead of being present at parse time). Exports (guarded by `typeof module !== "undefined"`): `bestOf`, `computeVerdict`, `setSpeciesData`. Later tasks (6, 7) read/extend `window.selected` and call `render()` — keep both as globals (`let selected = []`, a global `render` function), since `app.js` needs to push real pals into the same array, and `app.js` is what will call `setSpeciesData` once `/api/species` resolves, before the first `render()`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pal-compare/compare.test.js
const test = require('node:test');
const assert = require('node:assert');
const { bestOf, computeVerdict, setSpeciesData } = require('../../pal-compare/public/js/compare.js');

// the three species this project already hand-verified against the real
// paldb.gg data and the real site's own verdict output earlier on
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pal-compare/compare.test.js`
Expected: FAIL (`Cannot find module '../../pal-compare/public/js/compare.js'`)

- [ ] **Step 3: Create the three `public/` files and delete the root HTML**

Move the whole `<style>` block out of `pal-compare.html` into `css/styles.css` verbatim. Move every function after the old `const PALS = JSON.parse(document.getElementById('pals-data').textContent);` line into `js/compare.js`, replacing that line with `let PALS_SPECIES = [];` and adding `function setSpeciesData(list) { PALS_SPECIES = list; }` (recompute any `id`-keyed lookup object inside this function or lazily where used — implementer's call, keep it minimal), plus the `module.exports` guard for `bestOf`, `computeVerdict`, `setSpeciesData`. Drop the `<script id="pals-data">` tag entirely — it is no longer needed since species arrive over `/api/species` (Task 6). `index.html` keeps the HTML body as-is, drops the inline `<style>` and `<script>` blocks, and instead has `<link rel="stylesheet" href="css/styles.css">` in `<head>` and, at the end of `<body>`, `<script src="js/compare.js"></script>` (Task 6 adds `js/app.js` right after it). Delete `pal-compare.html` and run `git rm pal-compare.html`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pal-compare/compare.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add pal-compare/public tests/pal-compare/compare.test.js
git rm pal-compare.html
git commit -m "refactor(pal-compare): split single-file comparator into public/ with css/js modules, species now injected"
```

---

### Task 6: Real-pal import on the frontend (`app.js`)

**Files:**
- Create: `pal-compare/public/js/app.js`
- Modify: `pal-compare/public/index.html` (add `<script src="js/app.js">`, add a "🔄 Resincronizar" button and a container for grouped real-pal chips)
- Modify: `pal-compare/public/js/compare.js` (the `workRows` line inside `renderTable`, see Step 3b)
- Test: `tests/pal-compare/app.test.js`

**Interfaces:**
- Consumes: `setSpeciesData`, `selected` array and `render()` (`compare.js`, Task 5), the server's `GET /api/species` / `GET /api/pals` / `POST /api/resync` (Task 4).
- Produces: `mergeRealPalWithSpecies(realPal: object, speciesBySlugOrId: object) -> object`, exported the same guarded way as Task 5, used by this task's test without a DOM or network. The merged object is a normal entry for `compare.js`'s `selected` array (same shape `PALS_SPECIES` entries have — `hp/attack/defense/work/...`) plus two additions: `_real: {nickname, level, rank, gender, friendship, talentHp, talentShot, talentDefense, passiveSkills, workBonus, location}`, and `workDisplay`, a **copy** of the species `work` object with each `_real.workBonus` category added on top (e.g. species `{Kindling: 3}` + bonus `{Kindling: 2}` → `workDisplay: {Kindling: 5}`). `work` itself is left as the untouched species value, per the Global Constraint that the three verdict formulas never take real per-pal values — only `workDisplay` (a new field `computeVerdict` never reads) carries the boosted number, and only the work-suitability table row (Step 3b) reads it. When no species match is found, the merge sets `_unknownSpecies: true`, `name` to the raw `character_id`, every numeric species stat (`hp, attack, defense, stamina, workSpeed, mountSpeed, combat, breedRank, food, rarity`) to `null`, `elements`/`drops` to `[]`, and `work`/`workDisplay` to `{}` plus `_real.workBonus` applied on top of the empty `workDisplay` (so a bonus on an unmatched species still shows) — `compare.js`'s existing `typeof v !== 'number'` checks already render the nulled stats as `—` without any new branching there (Review Focus item 2).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pal-compare/app.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pal-compare/app.test.js`
Expected: FAIL (`Cannot find module '../../pal-compare/public/js/app.js'`)

- [ ] **Step 3: Implement `mergeRealPalWithSpecies` and the page wiring in `pal-compare/public/js/app.js`**

`mergeRealPalWithSpecies(realPal, speciesById)` looks up `speciesById[realPal.character_id]`; if found, spreads its fields into a new object; if not, builds a stand-in with `name: realPal.character_id`, `slug: realPal.instance_id`, and `hp/attack/defense/stamina/workSpeed/mountSpeed/combat/breedRank/food/rarity` all `null`, `elements: []`, `work: {}`, `drops: []`, plus sets `_unknownSpecies: true`. Either way it attaches `_real` with the camelCase fields listed in this task's Interfaces block, reading them off the snake_case server response. Below that function, add the page bootstrap (not unit tested — covered by Task 7's manual end-to-end check): on `DOMContentLoaded`, `Promise.all([fetch('/api/species'), fetch('/api/pals')])`, call `setSpeciesData(species)` first, build `speciesById` from that same `species` list keyed by `.id`, then map each `/api/pals` result through `mergeRealPalWithSpecies` and push into `selected`, call `render()`, and group the rendered chips visually by `_real.location` (`"team"` vs `"base-N"`) by reading `p._real.location` wherever chips are built in `compare.js`'s `renderChips`/`render` — the implementer's call on the minimal DOM/CSS change needed (e.g. a small label prefix per chip) as long as Team and each Base number are visually distinguishable. Wire a `#resyncBtn` click handler that `POST`s `/api/resync`, then re-fetches `/api/pals` and re-renders; show the Review-Focus-item-1 friendly message (e.g. set a `#syncError` element's text) when the resync response status is 404. End the file with `if (typeof module !== "undefined") module.exports = { mergeRealPalWithSpecies };`. Add the button/containers this needs to `index.html` and the `<script src="js/app.js">` tag after `compare.js`.

- [ ] **Step 3b: Make the work-suitability table read `workDisplay` when present**

In `compare.js`'s `renderTable`, the line building the per-category rows currently calls `statRow(cat, p => (p.work && p.work[cat]) || null)` for each `cat` in `WORK_CATS`. Change the getter to `p => { const src = p.workDisplay || p.work; return (src && src[cat]) || null; }`. This is the only `compare.js` change in this task — `computeVerdict`'s base-worker total keeps reading `p.work` directly (unchanged), so a work-suitability bonus changes what the table shows for that Pal's row without changing who wins "Melhor trabalhador de base".

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pal-compare/app.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add pal-compare/public/js/app.js pal-compare/public/js/compare.js pal-compare/public/index.html tests/pal-compare/app.test.js
git commit -m "feat(pal-compare): fetch real team/base pals and merge them with species data"
```

---

### Task 7: Wire-up, docs, and end-to-end verification

**Files:**
- Create: `pal-compare/.gitignore`, `pal-compare/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing new consumed by later work (last task).

- [ ] **Step 1: Add `pal-compare/.gitignore`**

Contents: `data/`

- [ ] **Step 2: Write `pal-compare/README.md`**

Cover: prerequisites (`pip install -r requirements.txt`), how to run (`python server.py`, then open `http://localhost:5000`), what "Resincronizar" does and that it only reads the save (never writes), that `data/cache.sqlite3` is a disposable cache for both species and real pals (deleting it and restarting the server reseeds species from `species_seed.json` and leaves the pal list empty until the next "Resincronizar"), and the known v1 limitation that Base pals are numbered (`Base 1`, `Base 2`, ...) rather than named, per the design doc.

- [ ] **Step 3: Run the full automated suite**

Run: `pytest tests/pal-compare -v && node --test tests/pal-compare/*.test.js`
Expected: every test from Tasks 1–6 passes.

- [ ] **Step 4: Manual end-to-end smoke test**

Run: `cd pal-compare && python server.py`, open `http://localhost:5000`, click "Resincronizar".
Expected: the comparator populates with the real Team + Base pals (16 in the current save), grouped by Team/Base, each showing level/rank/IVs/passives; the known WoolFox with a MonsterFarm bonus shows a boosted number in that work-suitability row while the "Melhor trabalhador de base" verdict is unaffected by it; "+ Adicionar Pal" still adds any of the 288 species into the same comparison; stopping the save folder's access (e.g. pointing `LOCALAPPDATA` elsewhere) and clicking "Resincronizar" again shows the friendly no-save message instead of crashing.

- [ ] **Step 5: Commit**

```bash
git add pal-compare/.gitignore pal-compare/README.md
git commit -m "docs(pal-compare): add README and finish save-import feature"
```
