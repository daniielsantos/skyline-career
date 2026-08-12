# Open work / backlog curto

Atualizado 2026-08-12 após release **0.3.17**.

## Validar (manual)

- [ ] Instalar/atualizar para 0.3.17
- [ ] MSFS + Twin Otter no solo; Watch conecta sem storm `PIPE CLOSED`
- [ ] Re-dispatch / re-inject: Due fuel não fica preso em 2641 se OFP > tanques (clamp)
- [ ] Preflight payload ainda pode falhar se sim ≠ OFP — esperado até inject payload OK

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
