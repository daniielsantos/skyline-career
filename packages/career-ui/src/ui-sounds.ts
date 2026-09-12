/**
 * Ceremony cues for Preflight READY + flight settle.
 * Modes: off | chime (Web Audio) | voice (speechSynthesis) | both.
 * Prefs in localStorage; default voice.
 */

export type UiSoundId = 'preflight_ready' | 'flight_settled';
export type UiSoundMode = 'off' | 'chime' | 'voice' | 'both';

export const UI_SOUNDS_KEY = 'skyline.uiSounds';

const VOICE_LINES: Record<
  UiSoundId,
  { pt: string; en: string }
> = {
  preflight_ready: {
    pt: 'Pré-voo pronto.',
    en: 'Preflight ready.',
  },
  flight_settled: {
    pt: 'Voo concluído.',
    en: 'Flight complete.',
  },
};

/** @deprecated Prefer {@link loadUiSoundMode}. */
export function loadUiSoundsEnabled(): boolean {
  return loadUiSoundMode() !== 'off';
}

export function loadUiSoundMode(): UiSoundMode {
  try {
    const raw = localStorage.getItem(UI_SOUNDS_KEY)?.trim().toLowerCase();
    if (raw === 'off' || raw === '0' || raw === 'false') return 'off';
    if (raw === 'chime' || raw === 'sfx') return 'chime';
    if (raw === 'voice' || raw === 'speech') return 'voice';
    if (raw === 'both' || raw === 'on' || raw === '1' || raw === 'true') {
      // Legacy "on" (chime-only era) → both so existing installs get VO.
      return 'both';
    }
    // First run: voice is the clearer prototype cue.
    return 'voice';
  } catch {
    return 'voice';
  }
}

export function saveUiSoundMode(mode: UiSoundMode): void {
  try {
    localStorage.setItem(UI_SOUNDS_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

/** @deprecated Prefer {@link saveUiSoundMode}. */
export function saveUiSoundsEnabled(enabled: boolean): void {
  saveUiSoundMode(enabled ? 'voice' : 'off');
}

let sharedCtx: AudioContext | null = null;
let lastPlayAtMs = 0;
const MIN_GAP_MS = 700;
let voicesReady = false;

function ensureVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const load = () => {
    voicesReady = window.speechSynthesis.getVoices().length > 0;
  };
  load();
  if (!voicesReady) {
    window.speechSynthesis.addEventListener('voiceschanged', load, {
      once: true,
    });
  }
}

if (typeof window !== 'undefined') {
  ensureVoices();
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const byLang = (prefix: string) =>
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  return (
    byLang('pt-br') ||
    byLang('pt') ||
    byLang('en-us') ||
    byLang('en') ||
    voices[0] ||
    null
  );
}

function speakLine(id: UiSoundId): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  ensureVoices();
  const voice = pickVoice();
  const lang = (voice?.lang ?? navigator.language ?? 'en').toLowerCase();
  const usePt = lang.startsWith('pt');
  const text = usePt ? VOICE_LINES[id].pt : VOICE_LINES[id].en;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang ?? (usePt ? 'pt-BR' : 'en-US');
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.volume = 1;
  window.speechSynthesis.speak(utter);
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

function tone(
  ctx: AudioContext,
  opts: {
    freq: number;
    startAt: number;
    durationSec: number;
    gain?: number;
    type?: OscillatorType;
  },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.value = opts.freq;
  const peak = opts.gain ?? 0.12;
  const t0 = opts.startAt;
  const t1 = t0 + opts.durationSec;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

function playPreflightReadyChime(ctx: AudioContext): void {
  const t = ctx.currentTime + 0.02;
  tone(ctx, { freq: 523.25, startAt: t, durationSec: 0.14, gain: 0.14 });
  tone(ctx, {
    freq: 659.25,
    startAt: t + 0.12,
    durationSec: 0.22,
    gain: 0.16,
  });
}

function playFlightSettledChime(ctx: AudioContext): void {
  const t = ctx.currentTime + 0.02;
  tone(ctx, { freq: 392.0, startAt: t, durationSec: 0.16, gain: 0.13 });
  tone(ctx, {
    freq: 523.25,
    startAt: t + 0.11,
    durationSec: 0.16,
    gain: 0.14,
  });
  tone(ctx, {
    freq: 659.25,
    startAt: t + 0.22,
    durationSec: 0.28,
    gain: 0.16,
  });
}

function playChime(id: UiSoundId): void {
  const ctx = getCtx();
  if (!ctx) return;
  const run = () => {
    if (id === 'preflight_ready') playPreflightReadyChime(ctx);
    else playFlightSettledChime(ctx);
  };
  if (ctx.state === 'suspended') {
    void ctx.resume().then(run).catch(() => undefined);
  } else {
    run();
  }
}

/**
 * Play a ceremony cue. Debounced so Strict Mode / double polls do not stack.
 */
export function playUiSound(
  id: UiSoundId,
  opts?: { force?: boolean; mode?: UiSoundMode },
): void {
  const mode = opts?.mode ?? loadUiSoundMode();
  if (!opts?.force && mode === 'off') return;
  const effective: UiSoundMode =
    opts?.force && mode === 'off' ? 'voice' : mode;
  if (effective === 'off') return;

  const now = Date.now();
  if (!opts?.force && now - lastPlayAtMs < MIN_GAP_MS) return;
  lastPlayAtMs = now;

  const wantChime = effective === 'chime' || effective === 'both';
  const wantVoice = effective === 'voice' || effective === 'both';
  if (wantChime) playChime(id);
  if (wantVoice) speakLine(id);
}
