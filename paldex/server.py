import threading
import time

from flask import Flask, jsonify

from db import get_connection, replace_all_pals, get_all_pals, get_all_species, replace_all_techs, get_all_techs
from save_reader import extract_pals, extract_unlocked_techs, find_latest_level_sav

POLL_INTERVAL_SECONDS = 3


def stat_level_sav():
    """(mtime, size) of the newest Level.sav, or None if there is no save. Read-only."""
    try:
        st = find_latest_level_sav().stat()
    except (FileNotFoundError, OSError):
        return None
    return (st.st_mtime, st.st_size)


def create_app(db_path: str = "data/cache.sqlite3", seed_path: str = "species_seed.json") -> Flask:
    app = Flask(__name__, static_folder=None)  # só API; o frontend é servido pelo Vite (5173)
    conn = get_connection(db_path, seed_path=seed_path)
    app.config["DB_CONN"] = conn

    lock = threading.Lock()
    status = {"version": 0, "last_sync": None, "error": None}
    watch = {"seen": None, "synced": None}

    def sync_now():
        """Re-read the save into the cache. Raises FileNotFoundError if there is no save.
        On any other failure the previous cache is kept and the error is recorded."""
        with lock:
            try:
                pals = extract_pals()
            except FileNotFoundError:
                raise
            except Exception as e:
                status["error"] = str(e)
                return None
            replace_all_pals(conn, pals)
            try:
                replace_all_techs(conn, extract_unlocked_techs())
            except Exception:
                pass  # techs only drive the optional "saddle locked" indicator
            status["version"] += 1
            status["last_sync"] = time.time()
            status["error"] = None
            return pals

    def poll_save():
        """One watcher tick: resync when the save changed and stayed unchanged for one tick
        (the game writes the file in chunks, so a changing file may be half-written)."""
        sig = stat_level_sav()
        if sig is None or sig == watch["synced"]:
            watch["seen"] = sig
            return
        if watch["synced"] is None or sig == watch["seen"]:
            try:
                sync_now()
            except FileNotFoundError:
                watch["seen"] = sig
                return
            watch["synced"] = sig
        watch["seen"] = sig

    app.config["POLL_SAVE"] = poll_save

    @app.route("/api/species")
    def api_species():
        return jsonify(get_all_species(conn))

    @app.route("/api/pals")
    def api_pals():
        return jsonify(get_all_pals(conn))

    @app.route("/api/techs")
    def api_techs():
        return jsonify(get_all_techs(conn))

    @app.route("/api/status")
    def api_status():
        return jsonify(status)

    @app.route("/api/resync", methods=["POST"])
    def api_resync():
        try:
            pals = sync_now()
        except FileNotFoundError as e:
            return jsonify({"error": str(e)}), 404
        if pals is None:
            return jsonify({"error": status["error"]}), 500
        watch["synced"] = stat_level_sav()
        return jsonify(pals)

    return app


def start_watcher(app: Flask, interval: float = POLL_INTERVAL_SECONDS) -> threading.Thread:
    def loop():
        while True:
            try:
                app.config["POLL_SAVE"]()
            except Exception:
                pass  # never let the watcher thread die
            time.sleep(interval)

    t = threading.Thread(target=loop, name="save-watcher", daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    app = create_app()
    start_watcher(app)
    app.run(port=5000)
