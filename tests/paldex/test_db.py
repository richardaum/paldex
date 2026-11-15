import json
import sqlite3
import sys
import threading
sys.path.insert(0, "paldex")
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

def test_connection_is_usable_from_a_different_thread(tmp_path):
    # reproduces a real bug: Flask's dev server can handle each request on a
    # different thread than the one that opened the sqlite connection
    conn = get_connection(str(tmp_path / "cache.sqlite3"))
    errors = []
    def read_from_other_thread():
        try:
            get_all_pals(conn)
        except Exception as e:
            errors.append(e)
    t = threading.Thread(target=read_from_other_thread)
    t.start()
    t.join()
    assert errors == []
