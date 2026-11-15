import json
import os
import sqlite3

PALS_SCHEMA = """
CREATE TABLE IF NOT EXISTS pals (
    instance_id TEXT PRIMARY KEY,
    character_id TEXT,
    nickname TEXT,
    level INTEGER,
    rank INTEGER,
    gender TEXT,
    friendship INTEGER,
    talent_hp INTEGER,
    talent_shot INTEGER,
    talent_defense INTEGER,
    passive_skills TEXT,
    work_bonus TEXT,
    location TEXT
)
"""

TECHS_SCHEMA = "CREATE TABLE IF NOT EXISTS techs (name TEXT PRIMARY KEY)"

SPECIES_SCHEMA = """
CREATE TABLE IF NOT EXISTS species (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT,
    dex TEXT,
    elements TEXT,
    hp INTEGER,
    attack INTEGER,
    defense INTEGER,
    stamina INTEGER,
    workSpeed INTEGER,
    work TEXT,
    mountSpeed INTEGER,
    mountRunSpeed INTEGER,
    partnerSkill TEXT,
    breedRank INTEGER,
    food INTEGER,
    rarity INTEGER,
    drops TEXT,
    nocturnal INTEGER,
    combat INTEGER
)
"""

SPECIES_COLUMNS = [
    "id", "name", "slug", "dex", "elements", "hp", "attack", "defense",
    "stamina", "workSpeed", "work", "mountSpeed", "mountRunSpeed", "partnerSkill",
    "breedRank", "food", "rarity", "drops", "nocturnal", "combat",
]

PAL_COLUMNS = [
    "instance_id", "character_id", "nickname", "level", "rank", "gender",
    "friendship", "talent_hp", "talent_shot", "talent_defense",
    "passive_skills", "work_bonus", "location",
]


def get_connection(db_path: str, seed_path: str = "species_seed.json") -> sqlite3.Connection:
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute(PALS_SCHEMA)
    conn.execute(SPECIES_SCHEMA)
    conn.execute(TECHS_SCHEMA)
    _migrate_species(conn, seed_path)
    conn.commit()
    _seed_species_if_empty(conn, seed_path)
    return conn


def _migrate_species(conn: sqlite3.Connection, seed_path: str) -> None:
    """Cache antigo sem mountRunSpeed: adiciona a coluna e preenche a partir do seed."""
    cols = [r[1] for r in conn.execute("PRAGMA table_info(species)")]
    if "mountRunSpeed" in cols:
        return
    conn.execute("ALTER TABLE species ADD COLUMN mountRunSpeed INTEGER")
    if os.path.exists(seed_path):
        with open(seed_path, encoding="utf-8") as f:
            for sp in json.load(f):
                conn.execute("UPDATE species SET mountRunSpeed=? WHERE id=?", (sp.get("mountRunSpeed"), sp["id"]))


def _seed_species_if_empty(conn: sqlite3.Connection, seed_path: str) -> None:
    count = conn.execute("SELECT COUNT(*) FROM species").fetchone()[0]
    if count > 0:
        return
    if not os.path.exists(seed_path):
        return
    with open(seed_path, encoding="utf-8") as f:
        species_list = json.load(f)
    for species in species_list:
        row = (
            species["id"], species["name"], species["slug"], species["dex"],
            json.dumps(species["elements"]), species["hp"], species["attack"],
            species["defense"], species["stamina"], species["workSpeed"],
            json.dumps(species["work"]), species["mountSpeed"], species.get("mountRunSpeed"),
            species["partnerSkill"], species["breedRank"], species["food"],
            species["rarity"], json.dumps(species["drops"]),
            int(bool(species["nocturnal"])), species["combat"],
        )
        placeholders = ",".join("?" * len(SPECIES_COLUMNS))
        conn.execute(
            f"INSERT INTO species ({','.join(SPECIES_COLUMNS)}) VALUES ({placeholders})",
            row,
        )
    conn.commit()


def replace_all_pals(conn: sqlite3.Connection, pals: list[dict]) -> None:
    conn.execute("DELETE FROM pals")
    for pal in pals:
        row = (
            pal["instance_id"], pal["character_id"], pal["nickname"],
            pal["level"], pal["rank"], pal["gender"], pal["friendship"],
            pal["talent_hp"], pal["talent_shot"], pal["talent_defense"],
            json.dumps(pal["passive_skills"]), json.dumps(pal["work_bonus"]),
            pal["location"],
        )
        placeholders = ",".join("?" * len(PAL_COLUMNS))
        conn.execute(
            f"INSERT INTO pals ({','.join(PAL_COLUMNS)}) VALUES ({placeholders})",
            row,
        )
    conn.commit()


def get_all_pals(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM pals").fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["passive_skills"] = json.loads(d["passive_skills"])
        d["work_bonus"] = json.loads(d["work_bonus"])
        result.append(d)
    return result


def get_all_species(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM species").fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["elements"] = json.loads(d["elements"])
        d["work"] = json.loads(d["work"])
        d["drops"] = json.loads(d["drops"])
        d["nocturnal"] = bool(d["nocturnal"])
        result.append(d)
    return result


def replace_all_techs(conn: sqlite3.Connection, names: list[str]) -> None:
    conn.execute("DELETE FROM techs")
    conn.executemany("INSERT OR IGNORE INTO techs (name) VALUES (?)", [(n,) for n in names])
    conn.commit()


def get_all_techs(conn: sqlite3.Connection) -> list[str]:
    return [r[0] for r in conn.execute("SELECT name FROM techs ORDER BY name").fetchall()]
