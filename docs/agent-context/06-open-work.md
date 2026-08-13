# Open work / backlog curto

Atualizado 2026-08-13 após cruise `readSimVars` abort (ainda sem release).

## Validar (manual)

- [ ] Hot-swap Host novo (`resources/host`) — log `timeout storm` / `unrecognized_id storm` + `connect() will reopen`
- [ ] Watch solo: um pedido `readSimVars` (não 16 stations em série)
- [ ] Watch no ar: tick de cruise ~5s no TIMEOUT (não ~45s); next tick `force: true`
- [ ] Cruise sample 180s: VS 400 fpm / TAS 10% / flow 20% / alt 1200 ft — não zerar em bump mínimo
- [ ] Watch: TIMEOUT não fica em loop com pipe “up”; após backoff, sample volta
- [ ] Reinject no solo após editar EFB: matching profile → fuel/cargo sem freeze em “Reading live aircraft…”
- [ ] Install &lt; 0.3.17: warning atual; Node não piora sem `sessionHealthy`
- [ ] Host antigo sem `readSimVars`: fallback sequential ainda throw no 1º TIMEOUT
- [ ] Idle no solo + editar EFB: schematic **não** colapsa para só Crew (S1/S2)
- [ ] Depois de um TIMEOUT, o tick seguinte faz disconnect+connect
  e volta a detectar mudança de payload (não gruda no mapa anterior)
- [ ] Black Square Accu-Sim: cargo no tablet (Pax/pods) **não** aparece nas
  stations clássicas — esperado, não é bug de detect via layout

## Possível próximo engenharia

1. Homologar wing tanks Twin Otter com vars corretas + writetest (só se quiser range completo).
2. Se dual-client IPC ainda estressar: serializar mais ops no Host (snapshot/identity) ou single-client pipe.
3. Watch: backoff mais agressivo quando Host reporta `NOT_CONNECTED` (opcional UX).
4. Ship release (0.3.22) com batch `readSimVars` + flight abort.

## Não fazer sem pedido

- Retune economy Dry / CARGO_FLOW_BALANCE
- Uncap heavy crew
- Reintroduzir AUX writes
- Commit de pulse dumps

## Handoff para chat novo

Mensagem sugerida:

> Continua Skyline Career. Lê `@docs/agent-context/project-overview.md` e `@docs/agent-context/README.md`. Estamos em desktop 0.3.17; problema atual: …
