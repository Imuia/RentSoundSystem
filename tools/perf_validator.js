'use strict';

const fs = require('fs');
const path = require('path');
const { walk } = require('./route_checker');
const { parseArgs } = require('./schema_validator');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const pages = walk(root, root);
  const findings = [];
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    if (/<script\b(?![^>]*\b(?:async|defer)\b)[^>]*\bsrc=/i.test(html)) {
      findings.push({ page: rel, issue: 'external_script_without_async_or_defer_review' });
    }
    if (/<img\b(?![^>]*\b(?:width|height)\s*=)[^>]*>/i.test(html)) {
      findings.push({ page: rel, issue: 'image_missing_dimensions_review' });
    }
  }
  const lighthouseAvailable = (() => {
    try { require.resolve('lighthouse', { paths: [root] }); return true; } catch { return false; }
  })();
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), root, pagesScanned: pages.length,
    staticFindings: findings, lighthousePackageAvailable: lighthouseAvailable,
    lighthouseRun: 'NOT_RUN',
    note: 'No performance score or LCP is fabricated. A real Lighthouse run requires a running target URL and explicit invocation.'
  }, null, 2));
  return 0;
}
if (require.main === module) process.exitCode = main();
