# Runway touchdown / debrief

## Sintoma (2026-10-03) — KMIA→MZBZ, toque no começo da 07, diagrama na metade

Debrief `RWY 07 · 1866 m past THR · 2 m right · on pavement · 2.95 km · lighted`. O ponto no desenho fica depois do meio (1866/2950 ≈ 63%). O piloto tocou no começo da 07.

## Causa

O catálogo de MZBZ guarda a cabeceira 07 como se fosse o centro da faixa: `lat/lon` 17.5369, -88.318123 é o LE do OurAirports (distância 0 m). O meio real fica 1.475 m à frente, metade dos 2.950 m. `projectOntoRunway` soma `length/2` em cima desse ponto, então todo toque nessa pista anda meia pista para a frente. 1866 − 1475 = 391 m depois da cabeceira de verdade, zona de toque. Os 2 m à direita e o “on pavement” estão certos: o eixo lateral bate.

Não é só Belize. Das faixas com as duas cabeceiras no OurAirports, 2.166 usam a cabeceira de origem como centro (2.034 a ~meia pista de distância do meio). 1.174 já estão no meio. Sem correção de catálogo.

## Fix

Não recolocar o centro a partir do OurAirports. A faixa do desenho é a capturada no MSFS (`msfs-hub-overrides.json`). MZBZ agora tem a faixa 07/25 do Facilities: centro 17.53984, -88.30460, 2956 m, rumo 77.1, asfalto — o meio geométrico, não a cabeceira. Um debrief novo nesse destino deixa o toque no começo da 07 perto dos 391 m, não em 1866. O voo já fechado não redesenha. O app aberto ainda tem o arquivo antigo na memória; o arquivo novo já está no perfil e entra no próximo start do Career. Detalhe em `04-hubs-simbrief.md`.

## Sintoma (2026-09-29) — ponto do toque longe da roda

O diagrama do debrief marca o toque dezenas de metros ao lado, com o avião na faixa.

## Causa

`bestRunwayProjection` trocava o eixo da faixa pelo rumo do avião sempre que isso diminuía o |lateral|. No caranguejo, alguns graus giram a faixa: 800 m × sin 5° ≈ 70 m. O rumo do catálogo, quando não é o stub magnético ident×10, já é o eixo verdadeiro.

O lat/lon do toque continua o datum que o MSFS trava (`PLANE TOUCHDOWN LATITUDE/LONGITUDE`). Recuar esse ponto até o trem lido no `flight_model.cfg` saiu: o arquivo quase nunca abre, e quando abre a diferença é de poucos metros, dentro do erro entre o centro do catálogo e o asfalto do simulador.

## Fix

- Eixo do catálogo. O rumo do avião só substitui o eixo num stub magnético que discorda desse rumo em mais de 12° (declinação, não caranguejo). A cabeceira e a faixa paralela continuam usando o rumo do avião.
- Rumo travado no toque (`PLANE TOUCHDOWN HEADING DEGREES TRUE`), não o poll seguinte.
- O desenho continua a faixa do catálogo. Centro ou rumo diferente do asfalto do simulador ainda desloca o ponto.

## Sintoma (2026-09-27) — pista do destino só no debrief

Comprimento, largura e luz só apareciam no diagrama depois do settle. O piloto descobria a faixa curta já na chegada.

## Causa

O catálogo já tinha a faixa. O Dispatch não lia `getAirportRunways` antes do OFP.

## Fix

Ícone ao lado do ICAO de destino no título da rota (Manifesto inclusive, antes do SimBrief). O clique abre um modal; a faixa mais longa vem primeiro. Identificador, comprimento, largura, superfície e luz. Sem frequência — o catálogo não tem. O ICAO continua abrindo o terminal. Despacho não é bloqueado.

## Sintoma (2026-09-27) — KMIA→SYMD pagou depois de spawn no menu

Debrief `msn_whhaul_3362_KMIA_SYMD_648462`: ON TIME, OFF RWY, +311 fpm, RWY 09 · 1.20 km · 30 m wide · unlit · 116767 m past THR · 45353 m left. Piloto (737) só viu o tamanho da pista na chegada, não pousou, foi ao menu, deu spawn e o parking brake fechou o settle.

## Causa

SYMD (Mahdia) é spoke de mineração de verdade: uma faixa 09/27, 1200×30 m, asfalto, `lighted: false` (`career-runways.json` + `career-gy-hubs-densify.ts`). Não há filtro de comprimento/largura por classe, então um haul de narrow freighter pode ser despachado para lá. Comprimento e luzes só aparecem no diagrama do debrief. O catálogo não tem frequências de rádio.

O marcador a ~125 km não é a faixa. Watch 23:25:48Z: pausa + `movedNm` 62.8 (teleporte) e first-contact em 5.966, -58.266 — SYLD Linden, não Mahdia (5.277, -59.152). +311 fpm é taxa de posicionamento. 23:29:00Z: segundo salto pausado de 67.2 nm, que cai em cima de Mahdia. 23:29:02Z `settle begin` com parking brake, motores off, `paused: true`. `gateSettleByDestination` só exige ≤12 nm da posição **ao vivo**; `paused_but_moved` deixa o tick valer como chegada. Pause não bloqueia settle.

## Fix

Porta no Watch, sem trilha gravada. `PAUSED_DEST_RELOCATION_NM` (15 nm): um tick pausado que cai dentro do raio de settle marca `destRelocationBlocksSettle` na missão. `gateSettleByDestination` devolve `settle_blocked` (também no settle congelado com parking brake) até um sample airborne, não pausado, sair do raio. Pause parado em cima da faixa continua podendo settle. Resume no origin não entra no raio do destino, então não arma o latch. O campo vai no JSON da missão (save antigo sem a chave = livre). Filtro de jato em faixa curta não entrou; Mahdia continua no mapa.

## Sintoma (2026-09-06)

Settle debrief em **SBCH**: `RWY 11 · 0 m past THR · 5860752 m left · OFF runway` com dot fora da strip — player pousou na **29** na pista.

## Causa

`career-runways.json` tinha o strip SBCH (e ~179 outros hubs) com **`lat: 0, lon: 0`, `headingTrueDeg: 0`** (Null Island).

Origem: `merge-missing-career-runways.mjs` fazia `Number("") === 0` nos ends vazios do OurAirports → centro válido falso → projeção do touchdown real vs (0,0) = milhões de metros laterais. Label “11” vinha do `ident` primary; heading 0 não alinhava approach 29.

## Fix

- Script `packages/shared/scripts/repair-null-island-runways.mjs` (`npm run repair:runways:null-island -w @msfs-compat/shared`) — rebuild OA + hub fallback; **0** null-island restantes.
- `num("")` → undefined em `generate-career-runways.mjs` + `merge-missing-career-runways.mjs`; rejeita Null Island.
- Runtime: `isUsableRunwayCenter` filtra 0,0 em `getAirportRunways`.
- Teste: SBCH center real + approach 29 on pavement.

## Sintoma (2026-09-12) — “OFF runway” com pouso na pista (SBKG e outros)

Debrief `431 m past THR · 158 m right · OFF runway` com landing score cheio. Repetia em hubs cujo heading do catálogo era **ident×10** (magnético).

## Causa sistêmica

`merge-missing` preenchia strips sem ends OA com `headingTrueDeg = runwayNumber × 10` (**magnético**). Projeção de touchdown precisa de **true**. Δheading ≈ declinação local (SBKG ~25°) → lateral falsa ≈ pastThr × sin(Δ).

## Fix definitivo (não só SBKG)

1. **Catalog repair:** `npm run repair:runways:magnetic -w @msfs-compat/shared`
   - OA LE→HE bearing quando ends existem
   - senão stub ident×10 → mag→true via WMM (`geomagnetism`)
   - 2026-09-12: **37** geo + **207** declinação corrigidos; SBKG = 125°
2. **merge-missing / generate:** não gravar ident×10 cru; convert WMM; preferir geometry OA.
3. **Runtime:** `bestRunwayProjection` + `isLikelyMagneticHeadingStub` — eixo do catálogo; rumo do avião só entra se o stub discorda dele em mais de 12°.

## Paths

- `packages/shared/src/career-runways.ts`
- `packages/shared/src/data/career-runways.json`
- `packages/shared/scripts/repair-null-island-runways.mjs`
- `packages/shared/scripts/repair-magnetic-runway-headings.mjs`
- `packages/shared/scripts/generate-career-runways.mjs`
- `packages/shared/scripts/merge-missing-career-runways.mjs`
