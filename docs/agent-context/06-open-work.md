# Open work / backlog curto

Atualizado 2026-08-13 após Host health / Watch reopen (ainda sem release).

## Validar (manual)

- [ ] Hot-swap Host novo (`resources/host`) — log `timeout storm` / `unrecognized_id storm` + `connect() will reopen`
- [ ] Watch: TIMEOUT não fica em loop com pipe “up”; após backoff, sample volta
- [ ] Reinject no solo após editar EFB: matching profile → fuel/cargo sem freeze em “Reading live aircraft…”
- [ ] Install &lt; 0.3.17: warning atual; Node não piora sem `sessionHealthy`
- [ ] Re-dispatch / re-inject: Due fuel não fica preso em 2641 se OFP > tanques (clamp)
- [ ] Preflight payload ainda pode falhar se sim ≠ OFP — esperado até inject payload OK
- [ ] Idle no solo + editar EFB: schematic **não** colapsa para só Crew (S1/S2);
  sample incompleto (TIMEOUT mid-loop) mantém o mapa anterior
- [ ] Depois de um TIMEOUT de station, o tick seguinte faz disconnect+connect
  e volta a detectar mudança de payload (não gruda no mapa anterior)
- [ ] Black Square Accu-Sim: cargo no tablet (Pax/pods) **não** aparece nas
  stations clássicas — esperado, não é bug de detect via layout

## Possível próximo engenharia

1. Homologar wing tanks Twin Otter com vars corretas + writetest (só se quiser range completo).
2. Se dual-client IPC ainda estressar: serializar mais ops no Host (snapshot/identity) ou single-client pipe.
3. Watch: backoff mais agressivo quando Host reporta `NOT_CONNECTED` (opcional UX).
4. Ship release com inject budget/timeout + taxi fuel cap + DR400 delay (ainda não em 0.3.17).

## Não fazer sem pedido

- Retune economy Dry / CARGO_FLOW_BALANCE
- Uncap heavy crew
- Reintroduzir AUX writes
- Commit de pulse dumps

## Handoff para chat novo

Mensagem sugerida:

> Continua Skyline Career. Lê `@docs/agent-context/project-overview.md` e `@docs/agent-context/README.md`. Estamos em desktop 0.3.17; problema atual: …
