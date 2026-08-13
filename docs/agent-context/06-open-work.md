# Open work / backlog curto

Atualizado 2026-08-13: A2A liveSource `a2a-lvars` (Preflight/Watch lê tablet). Dual-client IPC de fora.

## Validar (manual)

- [ ] Aerostar inject: tablet PAYLOAD = Due; Preflight Sim ≈ tablet (não 303 vs 1332)
- [ ] Aerostar schematic: Character* + BaggageWeight, não só S1/S7 clássicos

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

## Feito (local, sem release)

- Defs SimConnect reusadas para batches Watch/inject idênticos (cache no Host).
- Watch backoff 8s→15s em queda do MSFS; UI `Simulator closed — retry in Ns`.
- A2A Accu-Sim: liveSource `a2a-lvars` (PayloadWeight / Fuel* / Character*) no pack Aerostar/Comanche. Sem `if (a2a)` no fill.
- Aerostar fill: se CG já passou FWD com só crew, colocar Due na metade aft (não cortar cargo). Envelope calibrado −15…15.
- CG card: pinta envelope do perfil (calibrated-live), não SimVar FWD/AFT 0–100. Watch ainda não relê CG no tick.

## Não fazer sem pedido

- Retune economy Dry / CARGO_FLOW_BALANCE
- Uncap heavy crew
- Reintroduzir AUX writes
- Commit de pulse dumps

## Handoff para chat novo

Mensagem sugerida:

> Continua Skyline Career. Lê `@docs/agent-context/project-overview.md` e `@docs/agent-context/README.md`. Estamos em desktop 0.3.17; problema atual: …
