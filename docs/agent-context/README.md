# Agent context (handoff)

Pasta para **continuar trabalho em chats novos** sem carregar o transcript inteiro.
Cursor trava quando a conversa fica enorme — leia só os arquivos desta pasta + o código.

## Como usar (chat novo)

1. `@docs/agent-context/project-overview.md` — visão geral do projeto
2. `@docs/agent-context/README.md` — índice desta pasta
3. Abra **só** o tópico de sessão necessário (não carregue todos de uma vez)
4. Transcript antigo (só se precisar de detalhe histórico) — **não** commitar:
   `%USERPROFILE%\.cursor\projects\c-Users-daniel-Documents-msfs-compat-layer\agent-transcripts\`
   Sessão longa recente: `dbbbb643-2609-41b5-a827-560e59cb4138` (ATR/Titan/Corvalis + BBJ2 park; anterior: `4ed8b204-f6f8-49c7-8d5a-e577ad7d0d93`)

## Índice

| Arquivo | Quando ler |
|---------|------------|
| [project-overview.md](./project-overview.md) | Chat novo / “o que é este repo?” |
| [00-constraints.md](./00-constraints.md) | Sempre no início de sessão Skyline |
| [01-current-state.md](./01-current-state.md) | Versão instalada, releases, o que já shipou |
| [02-twin-otter-fuel.md](./02-twin-otter-fuel.md) | Fuel / inject Twin Otter / clamp / AUX |
| [03-simbridge-host.md](./03-simbridge-host.md) | PIPE CLOSED, UNRECOGNIZED_ID, Host zombie |
| [04-hubs-simbrief.md](./04-hubs-simbrief.md) | Chile ICAO, SimBrief allowlist, hub homologate |
| [05-paths-logs.md](./05-paths-logs.md) | Paths de install, AppData, logs |
| [06-open-work.md](./06-open-work.md) | Backlog curto / próximos passos |
| [07-inject-freeze.md](./07-inject-freeze.md) | Inject infinito Writing… / DR400 |
| [08-economy.md](./08-economy.md) | Economia — ponteiro ao roadmap |
| [09-homologate.md](./09-homologate.md) | Homologar airframe + hubs |
| [12-pax-efb-due.md](./12-pax-efb-due.md) | pax_and_cargo: EFB vs SimBrief vs estações; playbook Loaded≠Due (pax lb / cabin slots / holds / OEW Default / ghosts) |
| [13-collaborative-homologation.md](./13-collaborative-homologation.md) | Esboço: captura SimVar + review humano (não é o fluxo atual) |
| [10-aircraft-pool.md](./10-aircraft-pool.md) | Pool de aviões: regras + roadmap F0–F7 |
| [11-persist-commands.md](./11-persist-commands.md) | Settle/comandos SQL incrementais; pré-req MP |
| [14-mp-world-clock.md](./14-mp-world-clock.md) | MP: relógio autoritativo, tick server-side, fim do catch-up client |
| [15-business-model.md](./15-business-model.md) | Produto: B2P único, SP+MP, sem paywall de mapa; extras opcionais |
| [16-va-logistics.md](./16-va-logistics.md) | VA: ponte aérea WH→WH, desk auto-buy/scout (3 fases), tiers |
| [17-inject-regression.md](./17-inject-regression.md) | Pack GA/TP/light jet + checklist inject/read; Payload Lab (dev); freighter vs pax_and_cargo; mission `airframeLabel` enrichment |
| [18-aircraft-pricing-balance.md](./18-aircraft-pricing-balance.md) | Buy/lease: balancear por pay da classe (perna ref., voos/sem, voos p/ comprar) |
| [19-hub-stats.md](./19-hub-stats.md) | Aba Stats (hub) + Economy pulse tab (dev); samples SQLite v7/v8 |
| [20-economy-recovery-soak.md](./20-economy-recovery-soak.md) | Spec: recovery time pós-shock + soak 30d NPC-only (medida; sem retune Dry) |

## Manutenção

- **Mesmo turno em que a solução fecha:** escreva sintoma → causa → fix no `.md` do tópico (não espere o fim da sessão). Payload/EFB → `12-pax-efb-due.md`; Market/SimBrief → `09-homologate.md`; ver índice.
- Depois de uma sessão longa: atualize também `01` / `06` se estado ou backlog mudou.
- Prefira bullets e paths; **não** cole logs inteiros nem diffs enormes.
- Regras Cursor relacionadas: `.cursor/rules/career-*.mdc` (economia/map) + `agent-context-handoff.mdc` — não duplicar playbooks aqui.
