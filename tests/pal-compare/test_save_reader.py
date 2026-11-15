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
            # real shape confirmed against the save: WorkSuitability is an
            # EnumProperty (nested value.value), but Rank here is a flat
            # IntProperty ({"value": n}), unlike the character's own
            # ByteProperty-shaped star Rank field above.
            {"WorkSuitability": _enum(f"EPalWorkSuitability::{cat}"), "Rank": {"value": bonus_rank}}
            for cat, bonus_rank in work_bonus_entries
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

def test_pal_missing_optional_fields_gets_defaults_instead_of_crashing():
    # confirmed against the real save: some pals omit Rank/Gender/Talent_*
    # /PassiveSkillList entirely when they're at their default value
    sp = {"CharacterID": {"value": "Arsox"}}
    entry = {
        "key": {"InstanceId": {"value": "p1"}},
        "value": {"RawData": {"value": {"object": {"SaveParameter": {"value": sp}}}}},
    }
    containers = [_container("c-team", ["p1"])]
    result = extract_pals_from_gvas(_gvas([entry], containers))[0]
    assert result["level"] == 1
    assert result["rank"] == 1
    assert result["gender"] == "Male"
    assert result["talent_hp"] == 0
    assert result["talent_shot"] == 0
    assert result["talent_defense"] == 0
    assert result["passive_skills"] == []
    assert result["nickname"] == ""
    assert result["friendship"] == 0
