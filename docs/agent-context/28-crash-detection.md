# Crash detection (Watch) — sketch

Atualizado 2026-09-27. **Fase 1 shipped (código):** detector próprio + poll boost + auto-fail confiança alta. Sem MSFS `Crashed`. Sem perguntar ao jogador. Sem write-off de casco.

**2026-10-04 — KMIA→SVSE, pouso invertido, settle normal com payout.** Sintoma: jogador nunca viu o detector fechar um voo. O log local não tem nenhuma linha `impact fail`. Esse acidente foi na pista (RWY 11, 12 m do threshold, on pavement), dentro do raio de settle. `stepCrashDetect` zera o episódio quando `nearDest` — pouso no destino, mesmo de cabeça para baixo, não vira impacto.

**2026-10-04 — três ticks parado não acontecem.** Sintoma: depois do impacto a pessoa abre o menu e reposiciona; não fica no wreck. Causa: menu (`frozen`) e slew apagavam o episódio, e o veredito ainda pedia 3 amostras paradas. Fix: se o episódio já tem parada de verdade (AGL slam ou GS collapse) e mais um spike, o menu ou o reposicionamento fecha o voo. Manobra íngreme (só G/VS) + ESC continua muda. Perto do destino continua sem fail.

**2026-09-27 — teste KMIA→SYMD (737), manobra forte + montanha, nada falhou.** Sintoma: voo segue `in_flight`, sem debrief de impacto. Causa: curva inclinada com o avião ainda voando não é crash (voto de G só em ≥4,5). No impacto (~23:23Z) o poll chegou a 500 ms e em seguida o sim ficou `paused` com `movedNm` 0 e GS ainda ~289 kt. `stepCrashDetect` zerava o episódio em todo tick frozen, então os 3 ticks mortos nunca fechavam. Fix: pausa com o avião parado (`motionStopped`) e GS anterior ≥ 60 kt não apaga o episódio; a GS congelada conta como parada. Pausa em altitude (AGL alto, sem episódio) continua muda.

## O que já temos

- Watch amostra `G FORCE` (SimVar) a cada poll (`FLIGHT_SCORE` / `career-flight-score`: `maxG` / `minG` / G no touchdown).
- Landing score usa G perto de 1.0 e VS no touchdown — **pouso duro ≠ crash**.
- Restart no origin mid-flight já tratado (não settle no DEP) — ver `06-open-work.md`.

## O que o MSFS já expõe (nativo) — **fora de escopo**

O SDK tem `Crashed` / `CrashReset`, `CRASH FLAG`, `CRASH SEQUENCE`, `REALISM CRASH DETECTION`.

**DECIDIDO 2026-09-23:** **não** usar. Assistências permitem desligar crash detection → o sim fica mudo e a Career ficaria cega exatamente nos saves “easy”. Também exigiria Host assinar system events (pipe novo) por um canal que o jogador pode invalidar.

Career usa **só** telemetria já amostrada (G, VS, AGL, GS, onGround, destProximity, pipe health).

## Limite do G sozinho

- Poll adaptive (cruise pode ser **segundos** entre samples) → spike de impacto **pode passar entre ticks**.
- Hard landing / turbulence / go-around / slew / pause→unpause podem picos altos.
- `G FORCE` no MSFS é load factor vertical aproximado — não é IMU de acidente.

**Regra:** G é **um voto**, nunca o único gatilho.

## Poll rate — boost local, não cruise global

Hoje (`watchIntervalMsForPhase` + short-final AGL&lt;800):

| Fase | Intervalo |
|------|-----------|
| takeoff / landing | **200 ms** |
| approach | **500 ms** |
| climb / descent | **3 s** |
| cruise | **cap Settings** (tipicamente 4–5 s) |
| ground / taxi | **2 s** |

**Não** baixar o cruise inteiro (Watch/SimBridge sagrados).

**Shipped:** se airborne e (AGL &lt; 2500 ft **ou** \|VS\| ≥ 2500 fpm **ou** \|G−1\| ≥ 1.5), boost para approach rate (**500 ms**) por ~15 s (`crashBoostPoll` no Watch tick).

## Detector (shipped)

`packages/shared/src/career-flight-crash.ts` — `stepCrashDetect`.

- Armar: `sawAirborne`, não frozen, sim alive, **não** nearDest.
- Spike (≥1): G≥4.5 / VS≥4500 / AGL slam 200→20 / GS 60→8.
- High: **≥2** spike kinds + **3** dead ticks + not nearDest → verdict.
- Anti-FP: nearDest, slew jump, frozen, pipe down.

## Efeito (fase 1 shipped)

| Confiança | Ação |
|-----------|------|
| **Alta** | `failMissionImpact` → status `failed`, `failReason: impact`, payout 0, cargo **não** volta ao WH/demand; market lots `shrinkLotAfterDelivery`. Watch para + debrief via settlement (`impactEnded`, payLine factual). |
| **Baixa** | Silêncio. |
| Escape | Cancel flight (restaura cargo — abandono limpo). |

## Fase 2 (ainda não)

- MX severo / write-off / insurance / VA desk.
- Soak: 20 pousos + hard lands + restart + slew sem auto-fail.

## Decisões abertas

- Limiar G por classe?
- Lease / VA write-off payer?
- Cooldown pós-fail?
