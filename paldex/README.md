# Paldex

Painel dos seus Pals do Palworld: lê o Time e as Bases direto do save e mostra
os melhores em combate, montaria (aérea, terrestre, aquática) e trabalho de base.

## Rodando

```
pip install -r requirements.txt
python server.py
```

Isso sobe só a API (porta 5000, sem frontend). Para a interface, rode o Vite abaixo.

### Frontend (Vite)

Com o Flask rodando, em outro terminal:

```
npm install
npm run dev
```

Abra `http://localhost:5173`. CSS atualiza via HMR; mudanças em JS/HTML recarregam a página.
`/api` é encaminhado para o Flask na porta 5000.

## Rodar com autorestart (pm2)

```
npm i -g pm2
cd paldex && pm2 start ecosystem.config.js
pm2 logs paldex      # logs também em data/pm2-*.log
pm2 save             # lembra o processo (subir com a máquina: pm2-windows-startup)
```

Reinicia se crashar e ao editar `server.py`, `db.py`, `save_reader.py` ou a seed.
Mudanças em `public/` só precisam de F5.

## Sincronização automática

Um watcher em background (polling a cada 3s do `mtime`/tamanho do `Level.sav`)
relê o save quando o jogo salva, esperando o arquivo ficar estável para não
ler um `.sav` pela metade. A página consulta `/api/status` e atualiza sozinha.
Se a leitura falhar, os dados anteriores são mantidos e o erro aparece na tela.
O botão "🔄 Forçar" faz uma releitura manual. **Só leitura** — nunca grava nem
altera o arquivo `.sav`.

`data/cache.sqlite3` é um cache descartável: guarda tanto as 288 espécies
(semeadas uma vez a partir de `species_seed.json`) quanto os Pals reais do
seu Time/Base (escritos pela sincronização). Apagar esse arquivo e
reiniciar o servidor reconstrói as espécies automaticamente; os Pals reais
voltam a aparecer na primeira sincronização automática.

## Limitações conhecidas (v1)

- Bases aparecem numeradas (`Base 1`, `Base 2`, ...), sem nome — o nome da
  base vem de uma estrutura do save (`GroupSaveDataMap`) com formato
  binário que mudou com atualizações do jogo e não é lido de forma
  confiável ainda.
- A Pal Box é identificada como o maior container que não é o Time (heurística); aparece como "Pal Box".
- As fórmulas de veredito (combate/montaria/base) sempre usam os stats
  **base de espécie**, mesmo para Pals reais — nível, IVs e passivas
  aparecem como informação adicional, não entram nessas contas.
