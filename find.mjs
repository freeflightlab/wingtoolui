/* find.mjs — search what already exists, before writing it again.
 *
 *   node tools/find.mjs wake drag
 *   node tools/find.mjs "cross port"
 *
 * Five functions in this project were written twice: `pma.js` was
 * reimplemented as `inspection.js`, `buildRiserWebbing` as
 * `buildRiserAssembly`, `ribOpenings` as `reconcileRibOpenings`, plus
 * `chunkInto` and `totalLineLength`. Every one was caught afterwards — by the
 * build guard, the unused-export audit, or a name collision — which is late.
 *
 * Grep does not find them because the second version is written under a
 * different name; that is what makes it a duplicate rather than an edit. So
 * this searches the **doc comment** as well as the name, since two people
 * solving the same problem describe it in similar words even when they name
 * it differently.
 */
import { readFileSync, readdirSync } from 'fs';

const terms = process.argv.slice(2).map((t) => t.toLowerCase());
if (!terms.length) {
  console.log('usage: node tools/find.mjs <term> [term ...]');
  process.exit(1);
}

const hits = [];
for (const file of readdirSync('src/core').filter((f) => f.endsWith('.js'))) {
  const body = readFileSync(`src/core/${file}`, 'utf8');
  // Exports *and* module-private helpers, each with the block comment above
  // it. Searching exports only missed `chunkInto`, which is private — and a
  // private helper is exactly the kind of thing that gets written twice,
  // because nothing outside the file can see it.
  const re = /(\/\*\*[\s\S]*?\*\/\s*)?(export )?(?:function|const|class) (\w+)/g;
  for (const m of body.matchAll(re)) {
    const doc = (m[1] || '').replace(/^\s*\*\s?/gm, '').replace(/\/\*\*|\*\//g, '');
    const exported = Boolean(m[2]);
    const name = m[3];
    if (!exported && name.length < 4) continue;   // skip trivial locals
    const hay = `${name} ${doc}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (name.toLowerCase().includes(t)) score += 10;
      const inDoc = (hay.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(inDoc, 5);
    }
    if (score > 0) {
      const first = doc.trim().split('\n').filter((l) => l.trim())[0] || '';
      hits.push({ score, file, name, exported, summary: first.slice(0, 76) });
    }
  }
}

hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
if (!hits.length) {
  console.log(`nothing matches ${terms.join(' ')} — it probably does not exist yet`);
} else {
  console.log(`${hits.length} existing definitions match ${terms.join(' ')}:\n`);
  for (const h of hits.slice(0, 12)) {
    console.log(`  ${String(h.score).padStart(3)}  ${h.file.replace('.js', '').padEnd(14)} `
      + `${h.name}${h.exported ? '' : '  (private)'}`);
    if (h.summary) console.log(`       ${h.summary}`);
  }
  if (hits.length > 12) console.log(`  ... and ${hits.length - 12} more`);
}
