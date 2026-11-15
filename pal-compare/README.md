# Comparador de Pals

Compara Pals lado a lado (combate, montaria, trabalho de base). Abre já
populado com os Pals do seu Time e das suas Bases, lidos direto do save do
Palworld, e deixa adicionar qualquer outra espécie na mesma comparação.

## Rodando

```
pip install -r requirements.txt
python server.py
```

Abra `http://localhost:5000`.

## Resincronizar

O botão "🔄 Resincronizar" relê o save mais recente do Palworld e atualiza
o cache local. **Só leitura** — nunca grava nem altera o arquivo `.sav`.

`data/cache.sqlite3` é um cache descartável: guarda tanto as 288 espécies
(semeadas uma vez a partir de `species_seed.json`) quanto os Pals reais do
seu Time/Base (escritos pelo Resincronizar). Apagar esse arquivo e
reiniciar o servidor reconstrói as espécies automaticamente; os Pals reais
voltam a aparecer no próximo "Resincronizar".

## Limitações conhecidas (v1)

- Bases aparecem numeradas (`Base 1`, `Base 2`, ...), sem nome — o nome da
  base vem de uma estrutura do save (`GroupSaveDataMap`) com formato
  binário que mudou com atualizações do jogo e não é lido de forma
  confiável ainda.
- A Pal Box (armazenamento) não é importada — só Time e Bases.
- As fórmulas de veredito (combate/montaria/base) sempre usam os stats
  **base de espécie**, mesmo para Pals reais — nível, IVs e passivas
  aparecem como informação adicional, não entram nessas contas.
