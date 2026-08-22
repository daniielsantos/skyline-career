# Project overview — MSFS Compat Layer / Skyline Career

Produto: camada de compatibilidade **fuel/payload via SimConnect** + career cargo local (**Skyline Career**).  
Repo: [daniielsantos/skyline-career](https://github.com/daniielsantos/skyline-career)  
Workspace local: `C:\Users\daniel\Documents\msfs-compat-layer`

## Em uma frase

Lê/escreve combustível e payload no MSFS 2024 por **perfil por airframe**, despacha frete com **SimBrief OFP**, e acompanha o voo com **Watch → settle → logbook**, em cima de uma economia regional simulada.

## Arquitetura

```
MSFS 2024
   ↕ SimConnect
SimBridgeHost (C# / .NET 8)     native/SimBridgeHost
   ↕ Named pipe NDJSON  (msfs-compat-simbridge)
Agent / NamedPipeSimBridge      packages/agent
   ↕
Career UI + API                 packages/career-ui  (Vite UI + server)
Runtime (apply load plan)       packages/runtime
Shared types / economy / hubs   packages/shared
Catalog API (opcional)          packages/catalog-api
Desktop shell (Electron)        packages/desktop
```

Perfis de aeronave: `profiles/examples/*.json` (+ notes em `profiles/notes/`).  
Draft/calibração: agent CLI (`draft-profile`, `calibrate`, `writetest`, `smoke`).

## Pacotes (monorepo npm)

| Package | Papel |
|---------|--------|
| `@msfs-compat/shared` | Tipos, hubs, economy, SimBrief airports, bush trips, etc. |
| `@msfs-compat/runtime` | Engine de apply/verify do load plan |
| `@msfs-compat/agent` | Pipe client + CLI de probe/homologate |
| `@msfs-compat/career-ui` | Skyline Career UI + API (Market, Staging, Preflight, Watch) |
| `@msfs-compat/catalog-api` | Catálogo file-backed `/v1` |
| `skyline-career-desktop` | Electron: sobe API + Host + janela; auto-update |

## Loop de carreira (player)

1. **Market** — lots / bush trips  
2. **Prepare / Staging** — escolher airframe, payload, Accept & Dispatch  
3. **SimBrief OFP** — dispatch + inject fuel/payload (perfil)  
4. **Preflight** — Due vs Sim (fuel, payload, CG, gates)  
5. **Watch** — amostras live no pipe; fases ground → airborne → settle  
6. **Logbook** — histórico; staging limpa após settle  

Dev UI: `npm run career:ui` → UI `:5173`, API `:8787`.  
Ship: desktop installer (`npm run pack:desktop` / `release:desktop`).

## Conceitos-chave

- **Aircraft profile** — fingerprint (title/ICAO) → tanks, stations, writePlan, verify, constraints MAC.  
- **OFP load plan** — `buildOfpLoadPlan` / helpers em career-ui; density Jet-A; clamp capacidade.  
- **SimBridge exclusive gate** — serializa probe/watch start/inject no Node (`simbridge-gate.ts`).  
- **Economy** — ticks 15 min (`TICKS_PER_DAY=96`), hubs por país/região, NPC, fuel trucks, SQLite store. Detalhe: `.cursor/rules/career-economy-roadmap.mdc`.  
- **Map expansion** — checklist obrigatório: `.cursor/rules/career-map-expansion.mdc`.  
- **Bush trips** — soft-field / tours; **board temporarily disabled** (`BUSH_TRIPS_BOARD_ENABLED=false`); não misturar com Market freights.  
- **Homologate hubs** — facility MSFS deve bater ICAO catalog e ≤25 nm.

## Persistência

- Career: SQLite via `node:sqlite` (`openCareerStore`), migrate de JSON legado.  
- AppData runtime (install): `%APPDATA%\Skyline Career\`  
- Overrides de hub / saves de perfil ficam no lado do app, não no git (exceto seeds em `packages/shared` / `data/`).

## Comandos úteis

```powershell
npm install
npm run build
npm run build:native          # SimBridgeHost
npm run career:ui             # UI+API local
npm run host:simconnect       # Host sozinho
npm run pack:desktop          # installer artifacts/
npm run release:desktop -- --bump patch --yes
```

Agent (após build):

```powershell
node packages/agent/dist/cli.js writetest
node packages/agent/dist/cli.js smoke --profile profiles/examples\<profile>.json
```

## Onde está a verdade (não duplicar)

| Tópico | Fonte |
|--------|--------|
| Economy / o que já shipou | `.cursor/rules/career-economy-roadmap.mdc` |
| Novo país/hub | `.cursor/rules/career-map-expansion.mdc` |
| Sessão recente (Market ATR/Titan, BBJ2, Host…) | `docs/agent-context/01`, `06`, `09`, `10` |
| Constraints operacionais | `docs/agent-context/00-constraints.md` |
| README humano | `README.md`, `packages/career-ui/README.md`, `packages/desktop/README.md` |

## Idioma / estilo

- Código e commits: inglês, mensagens curtas focadas no *why*.  
- Usuário costuma falar PT — responder direto em PT quando ele escrever em PT.  
- Diffs mínimos; sem docs extras sem pedido (exceto esta pasta de contexto).
