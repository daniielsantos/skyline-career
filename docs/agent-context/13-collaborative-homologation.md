# Homologação colaborativa (esboço — não implementar agora)

Atualizado 2026-10-04. Design only. Homologação **hoje** continua sendo o fluxo interno em [`09-homologate.md`](./09-homologate.md) + [`12-pax-efb-due.md`](./12-pax-efb-due.md).

## Detector (2026-10-04) — classifica, não grava o catálogo

Uma amostra no solo, depois do Import no EFB, já separa as causas do playbook `12`. Entradas: payload Sim (soma das stations de passageiro + bagagem), Due (payload do OFP), contagem de pax, bagagem do load sheet, DOW/Empty, e o que está nos porões.

| Medição | Classe | Campo |
|---------|--------|--------|
| DOW ≠ Empty do OFP, ZFW live bate o papel | OEW / row SimBrief errada | `simbriefAirframeMatch` |
| `(Sim − porões) / N` ≈ constante > 175 e porões ≈ bagagem | pax mais pesado, malas ficaram | `efbPaxWeightLb` (soma o delta) |
| Sim ≈ `N × 100 kg` e FWD/AFT = 0 | CDU trocou o payload inteiro e largou as malas | `efbPaxWeightLb` + `efbImportOmitsBaggage` |
| Cabine soma `M × 170` com M > N | slots SimConnect a mais | `simconnectCabinSeats` |
| Porões < bag/cargo e a cabine já está certa | hold não cabe | `simconnectCargoHoldMaxLb` |
| Stations altas com peso e o EFB só mostra cabine+holds | ghost | omitir do `stationRoles` |

O A340-600 (KMIA–MGGT, 192 pax, +1 209 lb) cai na terceira linha. O helper antigo de `efbPaxWeightLb` sozinho teria empurrado o Due para ~49.8k. Por isso o detector **propõe uma classe** e o jogador confirma. Uma captura continua evidência local (AppData), não SKU de Market.

Motivo: o Market/Hangar só voa SKUs que o Skyline já homologou; a loja do MSFS tem muito mais títulos. On Air mistura um formulário (nome/ICAO/publisher) com um **voo de teste que lê SimVars** — não “o dev certifica no papel”.

O **i** nos cards (`airframe-addons.ts`) é só **exibição** do que já está homologado. Não é este pipeline.

## Não fazer

- Formulário **não** compra Hangar / não cria instância de economia.
- Não listar no Market a partir de **uma** captura.
- Não auto-merge para `profiles/examples` nem `career-player-airframes.json`.
- Não usar **MSFS Import Weights** no ritual (JF / iniBuilds / vários jets). Load no **EFB do addon**.
- Career-ui Vite **não** importa `@msfs-compat/shared` (index puxa `node:fs`).
- Um SKU por família de vidro (constraint de Market) continua válido depois do approve humano.

## Três pernas (todas necessárias para “voar no Skyline”)

| Perna | O quê | Falha típica |
|-------|--------|----------------|
| SimConnect | Ler (e opcionalmente escrever) fuel/payload no título live | Vars erradas, AUX, Host morto |
| SimBrief | `type=` ICAO ou id interno certo | Default vs pack Microsoft; F28 sem Default |
| Economia | SKU Hangar/Market (`typeId`, classe, caps) | Título live ≠ avião comprado |

Identidade live (título MSFS / publisher) **≠** SKU de economia. Hangar compra o SKU; o sim mostra o title.

## Ritual de captura (quando existir UI)

1. Skyline gera **o mesmo OFP** que o Dispatch (não um OFP “de laboratório”).
2. Jogador **Import / LOAD** no EFB do addon, **no solo**.
3. Skyline **lê SimVars** (ground). Compara Due vs Sim vs EFB.
4. **Writetest opcional:** se write bate → Inject capable; senão perfil **EFB-only** (`injectCapable: false` ou equivalente).
5. Correção Due/Watch **local:** o detector acima propõe **uma** classe (`12-pax-efb-due.md`). Um clique Continue grava essa classe em **AppData**, não no git. Sem confirmação, o Preflight continua vermelho.

## Depois do humano (não automático)

Ordem:

1. Alias `matchTitles` / `matchTitlePattern` no pack **já existente** (família).
2. Só então novo SKU / listar Market.

Uma captura de um player = evidência, não catálogo.

## Onde guardar (futuro)

| Camada | Onde | Quem |
|--------|------|------|
| Rascunho da sessão | `%APPDATA%\Skyline Career\` (JSON da captura + correção Due) | Máquina do jogador |
| Fila de review | Fora do save de carreira (export zip / issue / PR) | Dev |
| Verdade no jogo | `profiles/examples`, OFP packs, `career-player-airframes.json` | Merge humano |

Campos úteis no rascunho (não schema fechado): live title, ICAO, publisher/product, SimBrief `type=`, tanks/stations lidas, writetest pass/fail, um dos três campos Due, OFP id, data, versão do desktop.

## Fases (quando for a hora)

1. **Local only** — captura + AppData patch para aquele título nesta máquina (Watch/Due sem shipar SKU).
2. **Export** — zip/JSON para o maintainer revisar.
3. **Approve** — alias primeiro; Market por último; arte de card se SKU novo (`docs/market-airframe-card-prompts.md`).

Referência UX: modal Addons do On Air (publisher/produto). Skyline já tem o **i** nos cards para o catálogo atual.
