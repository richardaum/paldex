import sys
sys.path.insert(0, "paldex")
from server import create_app

SEED_FIXTURE_PATH = "tests/paldex/fixtures/species_seed_fixture.json"

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
    monkeypatch.setattr("server.extract_unlocked_techs", lambda: ["SkillUnlock_FlameBuffalo"])
    client = app.test_client()
    resync_resp = client.post("/api/resync")
    assert resync_resp.status_code == 200
    assert resync_resp.get_json()[0]["character_id"] == "Arsox"
    get_resp = client.get("/api/pals")
    assert get_resp.get_json()[0]["character_id"] == "Arsox"
    assert client.get("/api/techs").get_json() == ["SkillUnlock_FlameBuffalo"]

def test_resync_returns_404_when_no_save_found(tmp_path, monkeypatch):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    def boom():
        raise FileNotFoundError("no Level.sav found")
    monkeypatch.setattr("server.extract_pals", boom)
    client = app.test_client()
    resp = client.post("/api/resync")
    assert resp.status_code == 404
    assert "error" in resp.get_json()

FAKE_PAL = {"instance_id": "p1", "character_id": "Arsox", "nickname": "",
            "level": 1, "rank": 1, "gender": "Male", "friendship": 0,
            "talent_hp": 1, "talent_shot": 1, "talent_defense": 1,
            "passive_skills": [], "work_bonus": {}, "location": "team"}


def _watcher_app(tmp_path, monkeypatch, sig_holder):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    monkeypatch.setattr("server.extract_pals", lambda: [FAKE_PAL])
    monkeypatch.setattr("server.extract_unlocked_techs", lambda: [])
    monkeypatch.setattr("server.stat_level_sav", lambda: sig_holder["sig"])
    return app


def test_status_before_any_sync(tmp_path):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    body = app.test_client().get("/api/status").get_json()
    assert body["version"] == 0
    assert body["last_sync"] is None
    assert body["error"] is None


def test_watcher_syncs_first_poll_then_only_on_stable_change(tmp_path, monkeypatch):
    sig = {"sig": (1.0, 100)}
    app = _watcher_app(tmp_path, monkeypatch, sig)
    poll = app.config["POLL_SAVE"]
    client = app.test_client()

    poll()  # first poll syncs immediately
    assert client.get("/api/status").get_json()["version"] == 1
    assert client.get("/api/pals").get_json()[0]["character_id"] == "Arsox"

    poll()  # unchanged -> no resync
    assert client.get("/api/status").get_json()["version"] == 1

    sig["sig"] = (2.0, 150)  # game starts writing
    poll()  # changed but not yet stable
    assert client.get("/api/status").get_json()["version"] == 1
    poll()  # stable -> sync
    assert client.get("/api/status").get_json()["version"] == 2
    poll()
    assert client.get("/api/status").get_json()["version"] == 2


def test_watcher_keeps_old_data_and_reports_error_on_parse_failure(tmp_path, monkeypatch):
    sig = {"sig": (1.0, 100)}
    app = _watcher_app(tmp_path, monkeypatch, sig)
    poll = app.config["POLL_SAVE"]
    client = app.test_client()
    poll()

    def boom():
        raise ValueError("corrupt save")
    monkeypatch.setattr("server.extract_pals", boom)
    sig["sig"] = (2.0, 150)
    poll()
    poll()
    status = client.get("/api/status").get_json()
    assert "corrupt save" in status["error"]
    assert status["version"] == 1
    assert client.get("/api/pals").get_json()[0]["character_id"] == "Arsox"


def test_watcher_ignores_missing_save(tmp_path, monkeypatch):
    app = _watcher_app(tmp_path, monkeypatch, {"sig": None})
    app.config["POLL_SAVE"]()
    assert app.test_client().get("/api/status").get_json()["version"] == 0


def test_flask_is_api_only(tmp_path):
    app = create_app(str(tmp_path / "cache.sqlite3"), seed_path=SEED_FIXTURE_PATH)
    assert app.test_client().get("/").status_code == 404
