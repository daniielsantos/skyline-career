# Open work / backlog curto

Atualizado 2026-08-13: A2A liveSource `a2a-lvars` (Preflight/Watch lê tablet). Dual-client IPC de fora.

## Validar (manual)

- [ ] Watch CG card: após editar EFB, `% MAC` atualiza (não congela no Validate); Loaded vs Due não trava
- [ ] Preflight longe do origin → **NOT AT ORIGIN** + status line; Watch não auto-decola; spawn no hub certo limpa o card sem novo Validate
- [ ] Aerostar inject: Sim ≈ Due sem flick 672/535→751 (densidade resolveFuelDensity na pintura); tablet PAYLOAD = Due
- [ ] Aerostar schematic: Character* + BaggageWeight, não só S1/S7 clássicos
- [ ] Contract-pilot inject: não exige fuelAuthorizedOfpId (Accept OFP não trava Preflight/inject)

- [ ] Hot-swap Host novo (`resources/host`) — log `timeout storm` / `unrecognized_id storm` + `connect() will reopen`
- [ ] Watch solo: um pedido `readSimVars` (não 16 stations em série)
- [ ] Watch no ar: tick de cruise ~5s no TIMEOUT (não ~45s); next tick `force: true`
- [ ] Cruise sample 180s: VS 400 fpm / TAS 10% / flow 20% / alt 1200 ft — não zerar em bump mínimo
- [ ] Watch: TIMEOUT não fica em loop com pipe “up”; após backoff, sample volta
- [ ] Reinject no solo após editar EFB: matching profile → fuel/cargo sem freeze em “Reading live aircraft…”
- [ ] Caravan: leftover do Due divide L/R da fileira (não 192 num assento e 100 no outro)
- [ ] Install &lt; 0.3.17: warning atual; Node não piora sem `sessionHealthy`
- [ ] Host antigo sem `readSimVars`: fallback sequential ainda throw no 1º TIMEOUT
- [ ] Idle no solo + editar EFB: schematic **não** colapsa para só Crew (S1/S2)
- [ ] Depois de um TIMEOUT, o tick seguinte faz disconnect+connect
  e volta a detectar mudança de payload (não gruda no mapa anterior)
- [ ] Black Square Accu-Sim: cargo no tablet (Pax/pods) **não** aparece nas
  stations clássicas — esperado, não é bug de detect via layout

## Possível próximo engenharia

1. Homologar wing tanks Twin Otter com vars corretas + writetest (só se quiser range completo).
2. Dual-client IPC — **só** se freeze Watch+inject ainda aparecer no 0.3.24+.

## Feito (shipped 0.3.31)

- **SAVN hub:** catálogo AR tinha SAVN = Neuquén (~180 nm). Corrigido → San Antonio Oeste; **SAZN** = Neuquén. Migrate stamps lat/lon/name no load.

## Feito (shipped 0.3.39)

- **EN ROUTE blank:** `height:0` no painel sem pai flex — `.staging-panel` agora flex-fill sob `.main-content`.

## Feito (shipped 0.3.38)

- **EN ROUTE side:** OFP / Cargo / live-load no mesmo `dispatch-enroute-block`; títulos e grids na mesma coluna esquerda.

## Feito (shipped 0.3.37)

- **Route header:** sem chips OD duplicados; hubs só com cor no texto da OFP.
- **EN ROUTE:** side panel compactado sem scrollbar.

## Feito (shipped 0.3.36)

- **Route header:** hubs origem/destino coloridos na string OFP; labels navlog removidas; technical details colapsados por padrão.

## Feito (shipped 0.3.35)

- **EN ROUTE layout v2:** briefing cards no topo; Cargo com nome; Live load no fim; ROUTE no header do mapa; technical details colapsados por padrão.
- **Watch footer:** fora da área de scroll (sem invadir scrollbar); cruise burn kg/h de volta.

## Feito (shipped 0.3.34)

- **EN ROUTE polish:** capacity cards mesclados na seção Cargo; live load = preflight (schematics sempre visíveis); OFP ainda colapsado.

## Feito (shipped 0.3.33)

- **Dispatch EN ROUTE cockpit:** grid mapa (~60%) + status/live-load (~40%); OFP em `<details>`; mobile stack ~40vh.

## Feito (local, sem release)

- **Max cargo (missão):** online → SimBrief (`mzfw−oew` estrutural; `maxcargo` só se ≥½ estrutural / freighter). Catálogo JSON = fallback offline/API down (não short-circuit). Prefill light_ga ainda `manualpayload`.
- **Accept OFP cargo** também em **contract-pilot** (ex.: Blue Ridge + BN2): botão + CTA primário; trim escala pilot fee / gross.
- **BN2 Market:** um SKU `blackbox-bn2-islander-cargo-tip-tanks` (Cargo Tip Tanks + SpecialOps family).
- Defs SimConnect reusadas para batches Watch/inject idênticos (cache no Host).
- Watch backoff 8s→15s em queda do MSFS; UI `Simulator closed — retry in Ns`.
- A2A Accu-Sim: liveSource `a2a-lvars` (PayloadWeight / Fuel* / Character*) no pack Aerostar/Comanche. Sem `if (a2a)` no fill.
- Aerostar fill: se CG já passou FWD com só crew, colocar Due na metade aft (não cortar cargo). Envelope calibrado −15…15.
- CG card: pinta envelope do perfil (calibrated-live), não SimVar FWD/AFT 0–100. Watch soft-refresh de `liveMac` (cap ~1.2s); envelope pinned do Validate.
- Post-inject A2A: gate `PAYLOAD_NOT_APPLIED` lê `a2a-lvars` (não classic/MB); working plan sozinho não finge sucesso. Profile verify → `L:Character1Weight` + `L:BaggageWeight`.
- Preflight origin proximity: live MSFS ≤12 nm do `originIcao` (mesmo raio do settle); `location.ok=false` → headline **NOT AT ORIGIN** (antes do voo), step fica em load, Watch **não** auto-decola. No solo o Watch relê distância e libera o latch ao chegar no hub (sem novo Validate). Após wheels-up com latch limpo, card Origin **congela** (não fica vermelho com ORIGIN_NOT_ON_GROUND).
- Accu-Sim: **CTRL+E após inject** pode zerar Seat 1 / `Character1Weight` no EFB; start manual mantém. Não é write do Watch. Notas em `a2a-accusim.md` / Comanche / Aerostar. Comanche writePlan sem Character5/6.

## Não fazer sem pedido

- Retune economy Dry / CARGO_FLOW_BALANCE
- Uncap heavy crew
- Reintroduzir AUX writes
- Commit de pulse dumps

## Handoff para chat novo

Mensagem sugerida:

> Continua Skyline Career. Lê `@docs/agent-context/project-overview.md` e `@docs/agent-context/README.md`. Estamos em desktop 0.3.17; problema atual: …
