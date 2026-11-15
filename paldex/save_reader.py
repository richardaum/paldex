import json
import os
from pathlib import Path

import ooz

ZERO_GUID = "00000000-0000-0000-0000-000000000000"
TEAM_SIZE = 5

PLZ_MAGIC = b"PlZ"
PLM_MAGIC = b"PlM"

NEEDED_KEYS = [
    ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
]


def decompress_sav_to_gvas(data: bytes) -> "tuple[bytes, int]":
    import zlib

    uncompressed_len = int.from_bytes(data[0:4], "little")
    compressed_len = int.from_bytes(data[4:8], "little")
    magic_bytes = data[8:11]
    save_type = data[11]
    data_start_offset = 12
    if magic_bytes == b"CNK":
        uncompressed_len = int.from_bytes(data[12:16], "little")
        compressed_len = int.from_bytes(data[16:20], "little")
        magic_bytes = data[20:23]
        save_type = data[23]
        data_start_offset = 24

    payload = data[data_start_offset:data_start_offset + compressed_len]

    if magic_bytes == PLM_MAGIC:
        return ooz.decompress(payload, uncompressed_len), save_type

    if magic_bytes == PLZ_MAGIC:
        out = zlib.decompress(payload)
        if save_type == 0x32:
            out = zlib.decompress(out)
        return out, save_type

    raise Exception(f"unknown magic bytes: {magic_bytes!r}")


def find_latest_level_sav() -> Path:
    root = Path(os.environ["LOCALAPPDATA"]) / "Pal" / "Saved" / "SaveGames"
    candidates = [
        p for p in root.glob("**/Level.sav")
        if "backup" not in p.parts
    ] if root.exists() else []
    if not candidates:
        raise FileNotFoundError("no Level.sav found")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def extract_pals(sav_path: "Path | None" = None) -> list[dict]:
    sav_path = sav_path or find_latest_level_sav()

    import palworld_save_tools.archive
    import palworld_save_tools.palsav as palsav
    from palworld_save_tools.gvas import GvasFile
    from palworld_save_tools.json_tools import CustomEncoder
    from palworld_save_tools.paltypes import PALWORLD_CUSTOM_PROPERTIES, PALWORLD_TYPE_HINTS

    palsav.decompress_sav_to_gvas = decompress_sav_to_gvas
    palworld_save_tools.archive.FArchiveReader.eof = lambda self: True

    with open(sav_path, "rb") as f:
        data = f.read()
    raw_gvas, _ = decompress_sav_to_gvas(data)

    custom_properties = {
        key: value for key, value in PALWORLD_CUSTOM_PROPERTIES.items()
        if key in NEEDED_KEYS
    }
    gvas_file = GvasFile.read(raw_gvas, PALWORLD_TYPE_HINTS, custom_properties, allow_nan=True)
    gvas_dict = json.loads(json.dumps(gvas_file.dump(), cls=CustomEncoder))

    try:
        team_ids, box_ids = extract_player_container_ids(sav_path)
    except Exception:
        team_ids, box_ids = None, None
    return extract_pals_from_gvas(gvas_dict, team_ids, box_ids)


def _strip_enum(value: str) -> str:
    return value.split("::", 1)[-1]


def _byte_value(sp: dict, key: str, default: int) -> int:
    prop = sp.get(key)
    if prop is None:
        return default
    return prop["value"]["value"]


def _enum_value(sp: dict, key: str, default: str) -> str:
    prop = sp.get(key)
    if prop is None:
        return default
    return _strip_enum(prop["value"]["value"])


def player_container_ids_from_gvas(gvas: dict) -> "tuple[str | None, str | None]":
    """(team, pal box) container IDs from a Players/<uid>.sav GVAS dict."""
    save_data = gvas["properties"]["SaveData"]["value"]

    def _id(key):
        prop = save_data.get(key)
        return prop["value"]["ID"]["value"] if prop else None

    return _id("OtomoCharacterContainerId"), _id("PalStorageContainerId")


def extract_player_container_ids(sav_path: "Path | None" = None) -> "tuple[set[str], set[str]]":
    """Team and Pal Box container IDs of every player in the world (read-only)."""
    import palworld_save_tools.archive
    from palworld_save_tools.gvas import GvasFile
    from palworld_save_tools.json_tools import CustomEncoder
    from palworld_save_tools.paltypes import PALWORLD_TYPE_HINTS

    sav_path = sav_path or find_latest_level_sav()
    palworld_save_tools.archive.FArchiveReader.eof = lambda self: True
    teams: set[str] = set()
    boxes: set[str] = set()
    for player_sav in sorted((Path(sav_path).parent / "Players").glob("*.sav")):
        raw_gvas, _ = decompress_sav_to_gvas(player_sav.read_bytes())
        gvas_file = GvasFile.read(raw_gvas, PALWORLD_TYPE_HINTS, {}, allow_nan=True)
        gvas_dict = json.loads(json.dumps(gvas_file.dump(), cls=CustomEncoder))
        team, box = player_container_ids_from_gvas(gvas_dict)
        if team:
            teams.add(team)
        if box:
            boxes.add(box)
    return teams, boxes


def extract_pals_from_gvas(gvas: dict, team_ids=None, box_ids=None) -> list[dict]:
    world = gvas["properties"]["worldSaveData"]["value"]
    containers = world["CharacterContainerSaveData"]["value"]
    char_entries = world["CharacterSaveParameterMap"]["value"]

    instance_to_container: dict[str, str] = {}
    # Total slot-array length identifies the Team container (a fixed-size
    # 5-slot array that may not be full, e.g. a player with 3 active pals),
    # not the number of currently-filled slots.
    container_slot_counts: dict[str, int] = {}
    for container in containers:
        container_id = container["key"]["ID"]["value"]
        slots = container["value"]["Slots"]["value"]["values"]
        container_slot_counts[container_id] = len(slots)
        for slot in slots:
            instance_id = slot["RawData"]["value"]["instance_id"]
            if instance_id != ZERO_GUID:
                instance_to_container[instance_id] = container_id

    team_ids = set(team_ids or ())
    box_ids = set(box_ids or ())
    known = bool(team_ids or box_ids)

    team_container_id = None
    if not known:
        for container_id, count in container_slot_counts.items():
            if count == TEAM_SIZE:
                team_container_id = container_id
                break

    # The Pal Box is the largest non-team container, but only when there is
    # at least one other non-team container to compare it against -- a
    # single leftover container isn't "the biggest of the rest", it's just
    # a base.
    non_team_counts = {
        cid: count for cid, count in container_slot_counts.items()
        if cid != team_container_id and count > 0
    }
    box_container_id = None
    if not known and len(non_team_counts) > 1:
        box_container_id = max(non_team_counts, key=non_team_counts.get)

    base_labels: dict[str, str] = {}
    base_count = 0
    for container in containers:
        container_id = container["key"]["ID"]["value"]
        if container_id in (box_container_id, team_container_id) or container_id in team_ids | box_ids:
            continue
        if container_slot_counts[container_id] == 0:
            continue
        base_count += 1
        base_labels[container_id] = f"base-{base_count}"

    results = []
    for entry in char_entries:
        sp = entry["value"]["RawData"]["value"]["object"]["SaveParameter"]["value"]
        if sp.get("IsPlayer", {}).get("value"):
            continue
        instance_id = entry["key"]["InstanceId"]["value"]
        container_id = instance_to_container.get(instance_id)
        if container_id is None:
            continue
        if container_id == team_container_id or container_id in team_ids:
            location = "team"
        elif container_id == box_container_id or container_id in box_ids:
            location = "palbox"
        else:
            location = base_labels[container_id]

        work_bonus = {}
        for item in sp.get("GotWorkSuitabilityAddRankList", {}).get("value", {}).get("values", []):
            category = _strip_enum(item["WorkSuitability"]["value"]["value"])
            rank = item["Rank"]["value"]
            work_bonus[category] = rank

        results.append({
            "instance_id": instance_id,
            "character_id": sp["CharacterID"]["value"],
            "nickname": sp.get("NickName", {}).get("value", ""),
            "level": _byte_value(sp, "Level", 1),
            "rank": _byte_value(sp, "Rank", 1),
            "gender": _enum_value(sp, "Gender", "Male"),
            "friendship": sp.get("FriendshipPoint", {}).get("value", 0),
            "talent_hp": _byte_value(sp, "Talent_HP", 0),
            "talent_shot": _byte_value(sp, "Talent_Shot", 0),
            "talent_defense": _byte_value(sp, "Talent_Defense", 0),
            "passive_skills": sp.get("PassiveSkillList", {}).get("value", {}).get("values", []),
            "work_bonus": work_bonus,
            "location": location,
        })

    return results


def unlocked_techs_from_gvas(gvas: dict) -> list[str]:
    """Names from a Players/<uid>.sav GVAS dict (UnlockedRecipeTechnologyNames)."""
    save_data = gvas["properties"]["SaveData"]["value"]
    prop = save_data.get("UnlockedRecipeTechnologyNames")
    return list(prop["value"]["values"]) if prop else []


def extract_unlocked_techs(sav_path: "Path | None" = None) -> list[str]:
    """Technologies unlocked by the player(s) of the same world as Level.sav.

    Read-only. Saddles unlock via technology names like ``SkillUnlock_<CharacterID>``.
    """
    import palworld_save_tools.archive
    from palworld_save_tools.gvas import GvasFile
    from palworld_save_tools.json_tools import CustomEncoder
    from palworld_save_tools.paltypes import PALWORLD_TYPE_HINTS

    sav_path = sav_path or find_latest_level_sav()
    palworld_save_tools.archive.FArchiveReader.eof = lambda self: True
    names: set[str] = set()
    for player_sav in sorted((Path(sav_path).parent / "Players").glob("*.sav")):
        raw_gvas, _ = decompress_sav_to_gvas(player_sav.read_bytes())
        gvas_file = GvasFile.read(raw_gvas, PALWORLD_TYPE_HINTS, {}, allow_nan=True)
        gvas_dict = json.loads(json.dumps(gvas_file.dump(), cls=CustomEncoder))
        names.update(unlocked_techs_from_gvas(gvas_dict))
    return sorted(names)
