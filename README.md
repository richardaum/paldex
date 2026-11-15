# Paldex

Painel dos seus Pals do Palworld: lê o Time e as Bases direto do save e mostra
os melhores em combate, montaria (aérea, terrestre, aquática) e trabalho de base.

## Requisitos

- Python 3.10+ e Node.js 18+
- Palworld instalado (o app lê o `Level.sav` do seu save; **só leitura**)

## Rodando (atalho no Windows)

```powershell
# Se a execução de scripts estiver bloqueada, use o bypass (vale só para esse processo):
powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1

.\run.ps1           # avalia o sistema, instala o que faltar, sobe API + frontend (pm2) → http://localhost:5173
.\run.ps1 -Check    # só avalia os pré-requisitos
.\run.ps1 -Dev      # sem pm2, tudo nesta janela
.\run.ps1 -Stop     # para  (também: -Logs, -Status)
```

Com bypass, os parâmetros vão no fim: `powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 -Check`.

O script confere Python 3.10+, Node 18+, pip/npm, pm2, disco/memória, portas 5000/5173, se há
save do Palworld e acesso ao CDN dos ícones. Instala as dependências (e o pm2, se faltar) e termina
com um relatório `OK / WARN / FAIL` com a correção sugerida para cada item; os logs de instalação
ficam em `data/install-*.log`. Sai com código 1 se algo falhou.

## Rodando (manual)

```
git clone https://github.com/richardaum/paldex.git
cd paldex
pip install -r requirements.txt
npm install
```

Em dois terminais, na raiz do repo:

```
python server.py     # API (porta 5000, sem frontend)
npm run dev          # frontend (Vite)
```

Abra `http://localhost:5173`. CSS atualiza via HMR; mudanças em JS/HTML recarregam a página.
`/api` é encaminhado para o Flask na porta 5000.

## Onde fica o save

Por padrão: `%LOCALAPPDATA%\Pal\Saved\SaveGames\<id>\<mundo>\Level.sav` (Windows). Em outro
sistema ou servidor dedicado, aponte a pasta `SaveGames` (ou uma cópia) com a variável
`PALDEX_SAVE_DIR`:

```
PALDEX_SAVE_DIR=/caminho/para/SaveGames python server.py
```

Com mais de um mundo, aparece um dropdown na barra com o **nome do mundo** (lido do `LevelMeta.sav`)
para escolher qual ler; a escolha fica salva no navegador. Sem escolha, usa o save mais recente.

## Rodar com autorestart (pm2)

Precisa do `npm install` feito (o pm2 também sobe o Vite).

```
npm i -g pm2
pm2 start ecosystem.config.js
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

## Testes

```
python -m pytest tests
node --test tests/app.test.js tests/paldex.test.js
```
