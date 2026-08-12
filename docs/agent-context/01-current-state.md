# Current state (2026-08-12)

## Desktop

| Versão | Tag | Notas |
|--------|-----|--------|
| **0.3.18** (alvo deste release) | v0.3.18 | Taxi fuel cap 50% Due; inject timeout 15s/180s + progress; DR400 delay 400ms; docs/agent-context |
| 0.3.17 | [v0.3.17](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.17) | Host: recovery após `0xC00000B0`, sem ClearDataDefinition dinâmico, serialize ops |
| 0.3.16 | v0.3.16 | Clamp fuel OFP → tank capacity |
| 0.3.15 / 0.3.14 | … | Twin Otter density + revert AUX |

## Branch

`main` — handoff em `docs/agent-context/`.

## O que validar após 0.3.18

1. Drenar fuel no EFB com OFP curto → Preflight **não** fica READY (taxi cap).
2. Inject com Host doente → falha ≤ ~3 min com mensagem, não Writing infinito.
3. DR400 inject um pouco mais rápido no settle do writePlan.
4. Host 0.3.17+ ainda necessário para recovery de PIPE CLOSED.
