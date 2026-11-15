from flask import Flask, jsonify

from db import get_connection, replace_all_pals, get_all_pals, get_all_species
from save_reader import extract_pals


def create_app(db_path: str = "data/cache.sqlite3", seed_path: str = "species_seed.json") -> Flask:
    app = Flask(__name__, static_folder="public", static_url_path="")
    conn = get_connection(db_path, seed_path=seed_path)
    app.config["DB_CONN"] = conn

    @app.route("/")
    def index():
        return app.send_static_file("index.html")

    @app.route("/api/species")
    def api_species():
        return jsonify(get_all_species(conn))

    @app.route("/api/pals")
    def api_pals():
        return jsonify(get_all_pals(conn))

    @app.route("/api/resync", methods=["POST"])
    def api_resync():
        try:
            pals = extract_pals()
        except FileNotFoundError as e:
            return jsonify({"error": str(e)}), 404
        replace_all_pals(conn, pals)
        return jsonify(pals)

    return app


if __name__ == "__main__":
    create_app().run(port=5000)
