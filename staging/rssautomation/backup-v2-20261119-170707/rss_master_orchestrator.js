'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs } = require('./schema_validator');

const MODULES = [
  ['routes', 'route_checker.js'],
  ['assets', 'asset_validator.js'],
  ['security', 'security_audit.js'],
  ['performance', 'perf_validator.js']
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const lock = path.join(root, '.safety_lock');
  if (!fs.existsSync(lock)) {
    console.error('ABORT: .safety_lock is missing. No audit was run.');
    return 2;
  }
  const toolsDir = __dirname;
  const outputDir = path.join(root, 'staging', 'rssautomation');
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = { generatedAt: new Date().toISOString(), root, mode: 'STRICT_READ_ONLY_AUDITS', modules: [] };

  for (const [name, script] of MODULES) {
    const result = spawnSync(process.execPath, [path.join(toolsDir, script), '--root', root], {
      cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024
    });
    const item = { name, exitCode: result.status, error: result.error ? String(result.error.message) : null,
      stdout: result.stdout || '', stderr: result.stderr || '' };
    summary.modules.push(item);
  }

  const reportPath = path.join(outputDir, `rss-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Audit terminé. Rapport : ${path.relative(root, reportPath).replace(/\\/g, '/')}`);
  console.log(summary.modules.map(m => `${m.name}: ${m.exitCode === 0 ? 'OK' : 'À EXAMINER'}${m.stderr ? ' (voir stderr)' : ''}`).join('\n'));
  console.log('Aucun fichier source, aucune donnée distante et aucun service externe n’ont été modifiés.');
  return 0;
}
if (require.main === module) process.exitCode = main();
