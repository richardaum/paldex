// pm2: `pm2 start ecosystem.config.js` (dentro de paldex/)
// Útil: pm2 logs paldex | pm2 restart paldex | pm2 stop paldex | pm2 save
module.exports = {
  apps: [
    {
      name: "paldex",
      script: "server.py",
      interpreter: "python",
      cwd: __dirname,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      // Flask é só API (porta 5000). Reinicia ao editar código Python; ignora cache, logs e
      // public/ (o frontend é servido pelo processo paldex-vite, porta 5173).
      watch: ["server.py", "db.py", "save_reader.py", "species_seed.json"],
      ignore_watch: ["data", "__pycache__", "public", "node_modules"],
      env: { PYTHONUNBUFFERED: "1" },
      out_file: "data/pm2-out.log",
      error_file: "data/pm2-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "paldex-vite",
      script: "node_modules/vite/bin/vite.js",
      cwd: __dirname,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      out_file: "data/pm2-vite-out.log",
      error_file: "data/pm2-vite-err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
