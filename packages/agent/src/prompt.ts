import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export async function withPrompts<T>(fn: (ask: AskFn) => Promise<T>): Promise<T> {
  const rl = createInterface({ input, output });
  const ask: AskFn = async (question, defaultValue) => {
    const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    if (!answer && defaultValue !== undefined) return defaultValue;
    return answer;
  };
  try {
    return await fn(ask);
  } finally {
    rl.close();
  }
}

export type AskFn = (question: string, defaultValue?: string) => Promise<string>;

export async function confirm(ask: AskFn, question: string, defaultYes = true): Promise<boolean> {
  const def = defaultYes ? 'Y/n' : 'y/N';
  const raw = (await ask(`${question} (${def})`)).toLowerCase();
  if (!raw) return defaultYes;
  return raw === 'y' || raw === 'yes';
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
