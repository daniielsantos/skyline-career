# Inject freeze / DR400 notes

## Sintoma

Skyline inject fica em **Writing…** / "Building fuel…" sem sair. DR400 (e outros) afetados quando SimConnect está doente.

## Bug visual do toggle (0.3.18+)

Durante o inject, live fuel/payload podiam bater Due no meio do ramp → header **PREFLIGHT READY** enquanto ainda Writing; o knob usava só `skylineInjectEnabled` e ia para Off no fim do HTTP parecendo cancel mid-payload.

Fix: enquanto `loadOfpAutoStatus === 'loading'` → header **INJECTING LOAD**; switch On se `enabled || loading`; após sucesso label **Done**.

## O que os logs mostraram (DR400 KMCO→KMIA)

1. Primeiro inject **completou** (`inject end ok`) — tanque CENTER 29 gal ≈ 174 lb avgas.
2. Re-inject após drenar: `begin` → **~2 min** até `plan ready` (timeouts IPC de 60s × leituras mortas).
3. Fuel ramp 4 rounds com `liveFuelLb: null` (reads falhando; writes skipVerify “ok”).
4. Host spam `UNRECOGNIZED_ID` / exception 11 — sessão SimConnect instável.
5. UI fica em loading até o POST `/api/load-ofp` retornar (sem deadline antigo).

DR400 profile: 1 tanque CENTER 29 gal; writePlan delay era 1000 ms (agora 400).

## Mitigações no código

- Progresso: "Fetching SimBrief…", "Connecting…", "Reading aircraft…"
- IPC inject timeout **15s** (era 60s)
- Budget total inject **180s** → `OfpLoadTimedOutError` com mensagem clara
- DR400 fuel delay 1000→400 ms

## Workaround imediato (install atual)

1. Toggle inject **Off** (cancela).
2. Fechar Skyline + matar `SimBridgeHost` se necessário; reabrir com MSFS no solo.
3. Preferir desktop **≥ 0.3.17** (Host recovery). Este hang-fix ainda precisa de release seguinte.
4. Se voltar a congelar: Continue manually / EFB load.
