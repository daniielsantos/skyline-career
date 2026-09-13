/**
 * Ceremony cues for Preflight READY + flight settle.
 * Modes: off | chime (Web Audio) | voice (callout samples / speech) | both.
 *
 * Voice aims for GPWS-style cockpit callouts: English, female, clipped —
 * via shipped WAV samples (not ripped Honeywell audio). Falls back to
 * speechSynthesis if samples fail to load.
 */

export type UiSoundId = 'preflight_ready' | 'flight_settled';
export type UiSoundMode = 'off' | 'chime' | 'voice' | 'both';

export const UI_SOUNDS_KEY = 'skyline.uiSounds';

const CALLOUT_SRC: Record<UiSoundId, string> = {
  preflight_ready: '/sounds/callout-preflight_ready.wav',
  flight_settled: '/sounds/callout-flight_settled.wav',
};

/** Fallback TTS lines — English callout cadence (GPWS-style). */
const VOICE_LINES: Record<UiSoundId, string> = {
  preflight_ready: 'Preflight ready.',
  flight_settled: 'Flight complete.',
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
      return 'both';
    }
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
let lastPlayId: UiSoundId | null = null;
const MIN_GAP_MS = 700;
/** Same cue must not stack (Strict remount / tab reopen / flicker). */
const MIN_SAME_ID_GAP_MS = 2500;
/**
 * Ceremony voice/chime once per mission until load drops for a bit.
 * Survives Dispatch panel unmount when leaving the Active flight tab.
 */
const announcedReadyByMission = new Set<string>();
const clearReadyTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Settle cue once per mission (Watch poll race + Strict Mode). */
const announcedSettledByMission = new Set<string>();
let voicesReady = false;
const decodedCallouts = new Map<UiSoundId, AudioBuffer>();
const calloutLoadFailed = new Set<UiSoundId>();
let activeCalloutSource: AudioBufferSourceNode | null = null;
let calloutPlayGeneration = 0;

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

async function loadCalloutBuffer(
  ctx: AudioContext,
  id: UiSoundId,
): Promise<AudioBuffer | null> {
  if (decodedCallouts.has(id)) return decodedCallouts.get(id)!;
  if (calloutLoadFailed.has(id)) return null;
  try {
    const res = await fetch(CALLOUT_SRC[id]);
    if (!res.ok) {
      calloutLoadFailed.add(id);
      return null;
    }
    const raw = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(raw.slice(0));
    decodedCallouts.set(id, buf);
    return buf;
  } catch {
    calloutLoadFailed.add(id);
    return null;
  }
}

function playDecodedCallout(ctx: AudioContext, buffer: AudioBuffer): void {
  try {
    activeCalloutSource?.stop();
  } catch {
    /* already stopped */
  }
  activeCalloutSource = null;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Light cabin-speaker shaping on top of the pre-processed sample.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 250;
  hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  lp.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  activeCalloutSource = src;
  src.onended = () => {
    if (activeCalloutSource === src) activeCalloutSource = null;
  };
  src.start();
}

function playCalloutSample(id: UiSoundId): boolean {
  const ctx = getCtx();
  if (!ctx) return false;
  const generation = ++calloutPlayGeneration;
  const start = () => {
    void loadCalloutBuffer(ctx, id).then((buf) => {
      if (generation !== calloutPlayGeneration) return;
      if (buf) playDecodedCallout(ctx, buf);
      else speakCalloutFallback(id);
    });
  };
  if (ctx.state === 'suspended') {
    void ctx.resume().then(start).catch(() => {
      if (generation === calloutPlayGeneration) speakCalloutFallback(id);
    });
  } else {
    start();
  }
  return true;
}

/** Prefer female / callout-like voices for TTS fallback. */
function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase();
  let score = 0;
  if (lang.startsWith('en')) score += 100;
  else score -= 30;
  if (/\b(female|zira|aria|jenny|sara|susan|hazel|karen|moira|samantha|linda)\b/.test(name)) {
    score += 80;
  }
  if (/\b(natural|neural|online|premium)\b/.test(name)) score += 40;
  if (/\b(male|david|mark|guy|george|daniel desktop)\b/.test(name)) score -= 50;
  if (/\b(google|compact|espeak)\b/.test(name)) score -= 40;
  return score;
}

function pickCalloutVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

function speakCalloutFallback(id: UiSoundId): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  ensureVoices();
  const run = () => {
    const voice = pickCalloutVoice();
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(VOICE_LINES[id]);
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang ?? 'en-US';
    // Flat, measured GPWS-ish delivery.
    utter.rate = 0.78;
    utter.pitch = 1.12;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  };
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', run, { once: true });
    window.setTimeout(run, 250);
    return;
  }
  run();
}

function speakLine(id: UiSoundId): void {
  // Prefer shipped callout samples; TTS only if missing/broken.
  if (!playCalloutSample(id)) speakCalloutFallback(id);
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
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = opts.freq;
  const peak = opts.gain ?? 0.08;
  const t0 = opts.startAt;
  const t1 = t0 + opts.durationSec;
  const attack = Math.min(0.012, opts.durationSec * 0.08);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

function glassDing(
  ctx: AudioContext,
  opts: { freq: number; startAt: number; gain?: number },
): void {
  const peak = opts.gain ?? 0.07;
  tone(ctx, {
    freq: opts.freq,
    startAt: opts.startAt,
    durationSec: 1.05,
    gain: peak,
    type: 'sine',
  });
  tone(ctx, {
    freq: opts.freq * 2,
    startAt: opts.startAt,
    durationSec: 0.7,
    gain: peak * 0.18,
    type: 'sine',
  });
}

function playPreflightReadyChime(ctx: AudioContext): void {
  glassDing(ctx, { freq: 587.33, startAt: ctx.currentTime + 0.02, gain: 0.075 });
}

function playFlightSettledChime(ctx: AudioContext): void {
  const t = ctx.currentTime + 0.02;
  glassDing(ctx, { freq: 493.88, startAt: t, gain: 0.065 });
  glassDing(ctx, { freq: 659.25, startAt: t + 0.38, gain: 0.07 });
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
  if (!opts?.force) {
    if (now - lastPlayAtMs < MIN_GAP_MS) return;
    if (id === lastPlayId && now - lastPlayAtMs < MIN_SAME_ID_GAP_MS) return;
  }
  lastPlayAtMs = now;
  lastPlayId = id;

  const wantChime = effective === 'chime' || effective === 'both';
  const wantVoice = effective === 'voice' || effective === 'both';
  if (wantChime) playChime(id);
  if (wantVoice) speakLine(id);
}

/**
 * Preflight READY cue once per mission. Safe across tab remounts.
 * Clears only after load stays not-ready for a short hold (avoids flicker).
 */
export function playPreflightReadySound(missionId: string): void {
  const id = missionId.trim();
  if (!id) return;
  const pending = clearReadyTimers.get(id);
  if (pending) {
    clearTimeout(pending);
    clearReadyTimers.delete(id);
  }
  if (announcedReadyByMission.has(id)) return;
  announcedReadyByMission.add(id);
  playUiSound('preflight_ready');
}

/** Allow READY cue again after cargo/fuel leave match (not on tab close). */
export function notePreflightNotReady(missionId: string): void {
  const id = missionId.trim();
  if (!id || !announcedReadyByMission.has(id)) return;
  if (clearReadyTimers.has(id)) return;
  clearReadyTimers.set(
    id,
    setTimeout(() => {
      clearReadyTimers.delete(id);
      announcedReadyByMission.delete(id);
    }, 2000),
  );
}

export function clearPreflightReadySound(missionId: string): void {
  const id = missionId.trim();
  if (!id) return;
  const pending = clearReadyTimers.get(id);
  if (pending) {
    clearTimeout(pending);
    clearReadyTimers.delete(id);
  }
  announcedReadyByMission.delete(id);
}

/** Settle cue once per mission — Watch can race two polls at land. */
export function playFlightSettledSound(missionId: string): void {
  const id = missionId.trim();
  if (!id) return;
  if (announcedSettledByMission.has(id)) return;
  announcedSettledByMission.add(id);
  // Drop READY latch so a later leg on a reused id (unlikely) stays clean.
  announcedReadyByMission.delete(id);
  playUiSound('flight_settled');
}
