'use strict';

const fs = require('fs');
const path = require('path');
const { walk } = require('./route_checker');
const { parseArgs } = require('./schema_validator');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const htmlFiles = walk(root, root);
  const missing = [];
  const missingAlt = [];
  const refRe = /\b(?:src|href|poster)\s*=\s*["']([^"'#]+)["']/gi;
  for (const rel of htmlFiles) {
    const full = path.join(root, rel);
    const content = fs.readFileSync(full, 'utf8');
    let m;
    while ((m = refRe.exec(content))) {
      const ref = m[1].trim();
      if (/^(?:https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(ref)) continue;
      const clean = ref.split(/[?#]/)[0];
      if (!clean || clean.startsWith('#')) continue;
      const target = path.resolve(root, clean.startsWith('/') ? `.${clean}` : path.join(path.dirname(rel), clean));
      if (!target.startsWith(root + path.sep) && target !== root) continue;
      if (!fs.existsSync(target)) missing.push({ page: rel, reference: ref });
    }
    const imgRe = /<img\b([^>]*)>/gi;
    while ((m = imgRe.exec(content))) {
      const attrs = m[1];
      if (!/\balt\s*=/i.test(attrs)) missingAlt.push({ page: rel, snippet: m[0].slice(0, 180) });
    }
  }
  const report = { generatedAt: new Date().toISOString(), root, pagesScanned: htmlFiles.length,
    missingLocalReferences: missing, imagesWithoutAlt: missingAlt,
    note: 'References in dynamically generated HTML and CSS are not fully covered by this static HTML scan.' };
  console.log(JSON.stringify(report, null, 2));
  return missing.length ? 1 : 0;
}
if (require.main === module) process.exitCode = main();
