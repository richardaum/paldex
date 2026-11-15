import sys
sys.path.insert(0, "pal-compare")
from server import create_app

SEED_FIXTURE_PATH = "tests/pal-compare/fixtures/species_seed_fixture.json"

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
