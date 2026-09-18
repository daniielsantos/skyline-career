# Rebranding — Skyline Career → Airframe

Marca pública / domínio: **Airframe** (`playairframe.com`). Desktop display: **Airframe Career**; AppData/`appId` ainda legado Skyline.

Decisão (2026-09-15): domínio ≠ rename automático do monorepo. Fases abaixo.

## Fase 0 — feita / em produção

- Domínio Cloudflare: `playairframe.com`
- World: `https://world.playairframe.com` (API MP)
- Produto UI/installer ainda **Skyline Career**

## Fase 1 — infra URL (sem rebrand visual)

- [ ] Landing / Pages em `playairframe.com` (opcional; não bloqueia MP) — precisa brief visual
- [ ] `flyairframe.com` redirect → play (se registado) — DNS Cloudflare
- [x] Desktop default MP URL: PlayModeGate prefill/placeholder + resolve fallback → `https://world.playairframe.com` (`PUBLIC_WORLD_API_URL`). Lab continua `http://127.0.0.1:8787` via `DEFAULT_WORLD_API_URL` / env.
- [ ] Email Routing `hello@playairframe.com` (quando houver site)

### Diagnóstico CI (2026-09-17)

- **Sintoma:** CI `Typecheck` falha em `App.tsx` — `suggestedMpWorldApiUrl` não existe no tipo do state.
- **Causa:** `vite-env` + `main.mjs` expõem o campo; `playModeConfig` state/`setPlayModeConfig` omitiram ao passar do IPC.
- **Fix:** incluir `suggestedMpWorldApiUrl?` no state e copiar de `getPlayConfig()`.

## Fase 2 — rebrand visual

- [x] Logo AIR|FRAME hero: `packages/career-ui/src/assets/brand/airframe-hero-lockup.png` (arquivo Skyline mantido)
- [x] `BrandMark` `variant="hero"` → Airframe (AuthGate / ProfileGate / PlayModeGate / WorldWaitingGate)
- [x] Hero no painel: inset + `mix-blend-mode: lighten` (sem slab); FRAME `#f0a35a`
- [x] Compact sidebar **AIR|FRAME** (texto CSS + `md11f-mark`)
- [x] Display name desktop → **Airframe Career** (productName / Setup / Start Menu / window)
- [x] `userData` pin em `%APPDATA%\Skyline Career` + `appId` `com.skyline.career` intactos
- [x] Setup artifact → `Airframe-Setup-…exe`
- [x] Copy UI visível → Airframe (inject, help, hubs, updates, `index.html` title, SimBridge session names)
- [x] Ícone installer: mantém MD-11F (`packages/desktop/build/icon.ico`)
- [ ] IDs internos (`skylineDesktop`, `X-Skyline-*`, localStorage `skyline.*`, CSS `.skyline-inject-*`) — legado OK

### Auditoria copy UI (2026-09-17)

**Mudou (jogador vê):** inject label/toasts/status; page-help; Market/Map blurbs; sidebar fallback name; placeholders; DesktopUpdates; AircraftCards homologation; PayloadLab; DispatchRouteCard; `index.html`; bridge `open('Airframe Career UI …')`.

**Ficou (interno / API):** `window.skylineDesktop`, headers `X-Skyline-*`, keys `skyline.*`, classes CSS, nomes de props `skylineInjectEnabled`.

### Diagnóstico UI (2026-09-17)

- **Sintoma:** login parece card dentro de card / sem degrade / FRAME “outra cor”.
- **Causa:** full-bleed do PNG cobria o gradient do `.panel.profile-gate`; laranja gerado ≠ LINE/accent `#f0a35a`. Sidebar nunca mudou.
- **Fix:** hero inset; PNG field `#000` + `mix-blend-mode: lighten` (degrade do panel aparece; sem retângulo); FRAME → `#f0a35a`; rebuild `career-ui` dist.

## Auditoria de nomes (2026-09-17)

### Desktop — display (feito 2026-09-17)

| Onde | Agora |
|------|------|
| `productName` / `executableName` / `shortcutName` | Airframe Career |
| `artifactName` | `Airframe-Setup-…` |
| `afterPack.cjs` / window / dialogs | Airframe Career |
| `userData` | pin `%APPDATA%\Skyline Career` |
| `appId` | `com.skyline.career` (legado) |

### Desktop — **não** no mesmo PR (quebra saves/updates)

| Onde | Hoje | Risco |
|------|------|-------|
| `appId` | `com.skyline.career` | updates / AUMID |
| `userData` via `app.setName` | `%APPDATA%\Skyline Career` | saves |
| npm `name` | `skyline-career-desktop` | workspace only |
| `extraResources` → `skyline/` | path interno | pack scripts |
| GitHub `repo` | `skyline-career` | publish URL OK |

### UI copy (depois do display name)

Strings “Skyline inject”, “Skyline hubs”, placeholder “Ada Skyline”, etc. em `career-ui` — passe separado.

### Plano display name

1. [x] Display → **Airframe Career** (installer, Start Menu, Task Manager title).
2. [x] Manter `appId` + **pin** `app.setPath('userData', …\Skyline Career)` até Fase 3 migrator.
3. [x] Setup artifact → `Airframe-Setup-${version}.exe` (updater lê `latest.yml`; OK no próximo release).

Install path novo: `%LOCALAPPDATA%\Programs\Airframe Career` (instalação anterior pode ficar em `…\Skyline Career`).

### Topbar update button (2026-09-17)

**Sintoma:** `UPDATE x.y.z` só aparecia se o evento `available` chegasse com o React já montado; clique mandava para Settings.  
**Causa:** header só escutava IPC e não re-checava no login; download ficava no card de Settings.  
**Fix:** store compartilhado em `DesktopUpdates.tsx` — check ao entrar no shell (pós-login) + poll **30 min**; clique no botão faz download (barra no próprio pill) e depois `Install` lança o Setup one-click com `/S` (unsigned: ainda precisa SmartScreen → Run anyway; `runAfterFinish` tenta reabrir). Settings card continua como manual fallback. Check IPC agora devolve `updateAvailable` via semver (não só eventos); CDN stale que dispara `update-not-available` com remote &gt; installed ainda mostra Update.

## Fase 3 — paths / ids (migrar com cuidado)

- [ ] `%APPDATA%\Skyline Career\` → novo path **com** migração de saves
- [ ] Electron `appId` / protocol (quebra updates se mudarem sem plano)
- [ ] Repo / packages `skyline-career` — pode ficar legado por muito tempo
- [ ] Env `SKYLINE_*` / `skyline-paths` — **não** dia 1

## Não fazer no dia 1

- Renomear monorepo GitHub só por estética
- Mudar AppData sem migrator
- Trocar logo sem brief de arte (AIR|FRAME ≠ SKY|LINE simétrico)
- Landing genérica sem direção visual (ver user design rules)
