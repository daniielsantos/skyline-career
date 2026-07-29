import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export type AskFn = (question: string, fallback?: string) => Promise<string>;

export async function withPrompts<T>(fn: (ask: AskFn) => Promise<T>): Promise<T> {
  const rl = createInterface({ input, output });
  const ask: AskFn = async (question, fallback) => {
    const suffix = fallback !== undefined ? ` [${fallback}]` : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    if (!answer && fallback !== undefined) return fallback;
    return answer;
  };
  try {
    return await fn(ask);
  } finally {
    rl.close();
  }
}

export async function confirm(ask: AskFn, question: string, preferYes = true): Promise<boolean> {
  const yn = preferYes ? 'Y/n' : 'y/N';
  const raw = (await ask(`${question} (${yn})`)).toLowerCase();
  if (!raw) return preferYes;
  return raw === 'y' || raw === 'yes';
}

/** Numbered menu. Accept index (1-based), exact name, blank for default, or other for custom. */
export async function chooseFromList(
  ask: AskFn,
  question: string,
  options: string[],
  opts?: { defaultValue?: string; otherLabel?: string },
): Promise<string> {
  const unique = [...new Set(options.map((o) => o.trim()).filter(Boolean))];
  const preferred = opts?.defaultValue?.trim();
  const otherLabel = opts?.otherLabel;

  console.log(`  ${question}`);
  unique.forEach((opt, i) => {
    const mark = preferred && opt.toLowerCase() === preferred.toLowerCase() ? ' ←' : '';
    console.log(`    ${String(i + 1).padStart(2)}. ${opt}${mark}`);
  });
  const otherIndex = otherLabel ? unique.length + 1 : null;
  if (otherLabel && otherIndex !== null) {
    console.log(`    ${String(otherIndex).padStart(2)}. ${otherLabel}`);
  }

  const hint = preferred || unique[0] || '';
  const raw = (await ask('Choice (number or name)', hint)).trim();
  if (!raw) return (preferred || unique[0] || '').toLowerCase().replace(/\s+/g, '');

  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= unique.length) {
    return unique[asNum - 1]!.toLowerCase().replace(/\s+/g, '');
  }
  if (otherIndex !== null && asNum === otherIndex) {
    const custom = (await ask('Custom publisher slug')).trim();
    return custom.toLowerCase().replace(/\s+/g, '');
  }

  const hit = unique.find((o) => o.toLowerCase() === raw.toLowerCase());
  if (hit) return hit.toLowerCase().replace(/\s+/g, '');
  return raw.toLowerCase().replace(/\s+/g, '');
}

export function printSection(title: string): void {
  console.log('');
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}`);
}

export function printKv(rows: Array<[string, string | number | boolean | undefined | null]>): void {
  for (const [k, v] of rows) {
    if (v === undefined || v === null || v === '') continue;
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
}
