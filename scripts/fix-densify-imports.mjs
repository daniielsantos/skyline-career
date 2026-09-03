/**
 * Fix densify import accidentally inserted inside multi-line import { ... }.
 * Usage: node scripts/fix-densify-imports.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'shared', 'src');
const files = fs.readdirSync(ROOT).filter((f) => /^career-[a-z]{2}-hubs\.ts$/.test(f));
let fixed = 0;

for (const f of files) {
  const p = path.join(ROOT, f);
  let txt = fs.readFileSync(p, 'utf8');
  const re =
    /import \{\r?\nimport \{ ([A-Z]+)_DENSIFY_HUBS, ([A-Z]+)_DENSIFY_HUB_COUNT \} from '(\.\/career-[a-z]{2}-hubs-densify\.js)';\r?\n([\s\S]*?)\} from '(\.\/career-us-hubs\.js)';/;
  if (!re.test(txt)) continue;
  txt = txt.replace(re, (_m, a, b, densify, mid, us) => {
    return `import {\n${mid}} from '${us}';\nimport { ${a}_DENSIFY_HUBS, ${b}_DENSIFY_HUB_COUNT } from '${densify}';`;
  });
  fs.writeFileSync(p, txt);
  fixed += 1;
  console.log('fixed', f);
}
console.log('fixed count', fixed);
