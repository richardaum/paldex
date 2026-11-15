# Design: importar Pals reais do save no comparador

## Intenção
Hoje o `pal-compare.html` só compara *espécies* (stats base do jogo). A ideia
é deixar o usuário importar os Pals que ele realmente tem no save (nível,
IVs, passivas, localização) e navegar/comparar a partir deles, sem perder o
modo atual de comparação por espécie.

## Objetivo do app (ajustado)
O comparador parte **dos Pals que você já tem nas bases + no grupo (time
ativo)**, comparando-os entre si por padrão — e permite adicionar qualquer
outro Pal (qualquer espécie, como hoje) na mesma comparação. Não é mais
"dois modos separados" (espécie vs meus pals); é um comparador só, que já
abre populado com seus Pals reais e aceita adicionar mais.

## Escopo (v1)
- Ler os Pals do mundo via `Level.sav` → `CharacterSaveParameterMap`,
  **filtrando só Base e Grupo/Time** (a Pal Box fica de fora do v1 — não é
  o objetivo do app; ela é só armazenamento parado). Já testado com o save
  real: 11 Pals em base + 5 no time = 16 Pals relevantes (dos 148 totais).
- Classificar cada Pal em **Time** (container de 5 slots) ou **Base N**
  (demais containers com slots preenchidos, numerados — sem nome, ver
  "Não-objetivos").
- Campos por Pal: espécie (cruzada com o dataset do paldb.gg já embutido),
  apelido, nível, rank (estrelas), gênero, os 3 IVs (`Talent_HP/Shot/Defense`),
  passivas, amizade, e **bônus de aptidão de trabalho**
  (`GotWorkSuitabilityAddRankList` — lista de {categoria, rank extra} que só
  existe quando o Pal recebeu item/Pal Soul de upgrade; confirmado no save
  real: um WoolFox com bônus em MonsterFarm). `CurrentWorkSuitability` é só
  "em qual trabalho ele está agora", não é aptidão — não vamos usar esse.
- Tabela de trabalho na comparação: aptidão real do indivíduo = aptidão
  base da espécie (dataset) + bônus acima, categoria por categoria. Pals
  adicionados manualmente via picker mostram só o valor base (sem bônus,
  já que não vêm de um indivíduo real).
- Exportação é um passo manual: o usuário roda um script Python local que
  gera um JSON; a página HTML importa esse JSON (sem backend, sem rede) e
  pré-popula o comparador com esses Pals.
- O botão "+ Adicionar Pal" (picker por espécie, como já existe) continua
  igual, pra completar a comparação com qualquer outro Pal do jogo.

## Não-objetivos / fora do v1
- Nome de base (ex: "Base Vulcão") ou dono de base — `GroupSaveDataMap` usa
  um layout binário posicional que mudou com patches do jogo e quebrou nos
  parsers disponíveis. Fica "Base 1", "Base 2" por enquanto.
- Não é um editor de save — só leitura. Nunca grava no `.sav`.
- Não recalcula as fórmulas de veredito (combate/montaria/base) com os
  stats reais do indivíduo — continuam usando stats base de espécie, como
  o paldb.gg faz. O que muda é: dá pra *escolher* um indivíduo específico
  em vez de só a espécie, e ver nível/IVs/passivas dele ao lado.
- Multiplayer: não é tratado agora (o save de teste é solo; `OwnerPlayerUId`
  existe no dado mas não vou construir seletor de jogador no v1).

## Arquitetura (servidor Python + cache SQLite)

```
pal-compare/
  server.py                # Flask: estáticos + API
  save_reader.py           # os patches de Oodle/GVAS já validados + extração,
                            # como função importável (sem subprocess)
  db.py                    # wrapper do sqlite3 (stdlib — zero dependência nova)
  data/
    cache.sqlite3          # cache local (gitignored) — Pals de Base+Time
  public/
    index.html             # esqueleto da página, só estrutura
    css/
      styles.css           # todo o CSS que hoje está inline no <style>
    js/
      data.js              # PALS_SPECIES — dataset das 288 espécies (paldb.gg)
      compare.js           # lógica de seleção, veredito, tabela
      app.js               # busca /api/pals, popula comparador, botão "Resincronizar"
  requirements.txt         # flask, palworld-save-tools, pyooz
  README.md
```

- **Servidor único em Python** (Flask — já que o script de extração também é
  Python, evita duas linguagens e um subprocess). `sqlite3` é da standard
  library, sem dependência nova. Tabela única `pals` (instance_id PK,
  character_id, nickname, level, rank, ivs, passivas, bônus de trabalho,
  amizade, location, synced_at).
- **`server.py`** expõe:
  - `GET /api/pals` → lê do SQLite, devolve JSON pronto pro front.
  - `POST /api/resync` → chama `save_reader.extract_pals()` **direto**, em
    processo (sem subprocess), faz upsert no SQLite (atualiza quem já
    existe, insere novo, remove quem sumiu do save) e devolve o resultado.
  - serve os arquivos estáticos de `public/`.
- **Front-end**: igual ao desenho anterior — `app.js` busca `/api/pals` ao
  carregar, comparador já abre com Base+Time, botão "🔄 Resincronizar"
  chama `/api/resync`, "+ Adicionar Pal" continua usando `data.js`.
- Uso: `python server.py` e abre `http://localhost:5000`.

## Dependências novas
`pyooz` e `palworld-save-tools` (ambas já instaladas via pip --user nesta
máquina) — citadas no README como pré-requisito pra rodar `export_save.py`.

## Decisão pendente de implementação (minha, documentando)
Vou manter `export_save.py` como script de linha de comando simples
(`python tools/export_save.py` → gera `meus-pals.json` ao lado), em vez de
.exe/instalador — é uso pessoal, e você já tem Python configurado.
