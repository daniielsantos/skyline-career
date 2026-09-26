# Rebranding — Skyline Career → Airframe

Marca pública / domínio: **Airframe** (`playairframe.com`). Desktop display: **Airframe Career**.  
AppData: `%APPDATA%\Airframe Career\` (Fase 3 migrator). `appId` ainda `com.skyline.career` (updater/AUMID).

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
- [x] `userData` pin em `%APPDATA%\Airframe Career` + migrator one-shot (legado Skyline copiado; pasta antiga fica)
- [x] `appId` `com.skyline.career` **mantido** (Fase 3b) — não mudar AUMID/updater no mesmo ship
- [x] Setup artifact → `Airframe-Setup-…exe`
- [x] Copy UI visível → Airframe (inject, help, hubs, updates, `index.html` title, SimBridge session names)
- [x] Ícone installer/taskbar: lettermark **A** amber `#f0a35a` on charcoal (`packages/desktop/build/icon.ico` + `icon.png`) — substitui MD-11F genérico (2026-09-26)
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
| `userData` | pin `%APPDATA%\Airframe Career` (+ migrator) |
| `appId` | `com.skyline.career` (legado — Fase 3b) |

### Desktop — **adiado / legado OK**

| Onde | Hoje | Notas |
|------|------|-------|
| `appId` | `com.skyline.career` | Fase 3b — AUMID / taskbar pin |
| `userData` | `%APPDATA%\Airframe Career` | Migrator shipped; Skyline folder backup |
| npm `name` | `skyline-career-desktop` | workspace only |
| `extraResources` → `skyline/` | path interno | pack scripts |
| GitHub `repo` | `skyline-career` | publish URL OK |

### UI copy (depois do display name)

Strings “Skyline inject”, “Skyline hubs”, placeholder “Ada Skyline”, etc. em `career-ui` — passe separado.

### Plano display name

1. [x] Display → **Airframe Career** (installer, Start Menu, Task Manager title).
2. [x] **Pin** `app.setPath('userData', …\Airframe Career)` + migrator one-shot de Skyline (Fase 3). `appId` permanece `com.skyline.career` até Fase 3b.
3. [x] Setup artifact → `Airframe-Setup-${version}.exe` (updater lê `latest.yml`; OK no próximo release).

Install path novo: `%LOCALAPPDATA%\Programs\Airframe Career` (instalação anterior pode ficar em `…\Skyline Career`).

### Topbar update button (2026-09-17)

**Sintoma:** `UPDATE x.y.z` só aparecia se o evento `available` chegasse com o React já montado; clique mandava para Settings.  
**Causa:** header só escutava IPC e não re-checava no login; download ficava no card de Settings.  
**Fix:** store compartilhado em `DesktopUpdates.tsx` — check ao entrar no shell (pós-login) + poll **30 min**; clique no botão faz download (barra no próprio pill) e depois `Install` lança o Setup one-click com `/S` (unsigned: ainda precisa SmartScreen → Run anyway; `runAfterFinish` tenta reabrir). Settings card continua como manual fallback. Check IPC agora devolve `updateAvailable` via semver (não só eventos); CDN stale que dispara `update-not-available` com remote &gt; installed ainda mostra Update.

**Layout (2026-09-20):** pill centrada no topbar; design mais largo/quadrado (radius baixo, uppercase, min-width) pra update saltar à vista — não o chip fino ao lado do título.

### Dois checks / “2 atualizações” no boot (2026-09-19)

**Sintoma:** na app Airframe (Settings → Updates / flash do header) parece que a atualização roda **duas vezes** ao abrir.  
**Causa:** dois `checkForUpdates` no mesmo boot — (1) `packages/desktop/main.mjs` silent boot após 4s; (2) `ensureDesktopUpdateBridge()` em `DesktopUpdates.tsx` ao montar o shell. Cada um emitia `checking` / `available` via IPC.  
**Fix:** removido o boot check do `main.mjs`; ficou **um** check no mount do shell + poll quieto a cada **30 min** (`DESKTOP_UPDATE_POLL_MS`) enquanto o app fica aberto (pula se já há update offered/downloading).

## Fase 3 — paths / ids (migrar com cuidado)

Atualizado 2026-09-20: **userData migrator shipped** — `migrate-userdata.mjs` copia `%APPDATA%\Skyline Career` → `%APPDATA%\Airframe Career` na 1ª abertura (staging+rename; marker `.airframe-userdata-migrated.json`; não apaga legado; não sobrescreve Airframe com dados). `main.mjs` pina o path novo. **Smoke:** install antigo → update → profiles em Airframe; pasta Skyline ainda presente.

- [x] `%APPDATA%\Skyline Career\` → `%APPDATA%\Airframe Career\` **com** migração de saves
- [ ] Electron `appId` / protocol → `com.airframe.career` (**Fase 3b** — quebra taskbar pin / AUMID se mudarem sem plano; updater GitHub OK pelo `publish.repo`)
- [ ] Repo / packages `skyline-career` — pode ficar legado por muito tempo
- [ ] Env `SKYLINE_*` / `skyline-paths` — **não** dia 1

## Não fazer no dia 1

- Renomear monorepo GitHub só por estética
- Mudar AppData sem migrator *(feito — migrator shipped)*
- Trocar `appId` no mesmo ship que o path (Fase 3b separado)
- Trocar logo sem brief de arte (AIR|FRAME ≠ SKY|LINE simétrico)
- Landing genérica sem direção visual (ver user design rules)
