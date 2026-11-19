'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('./schema_validator');

const SKIP = new Set(['.git', 'node_modules', '.vercel', 'staging', 'logs', 'uploads']);
const SECRET_PATTERNS = [
  /\b(?:api[_-]?key|secret|access[_-]?token|service[_-]?role)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{16,})/i,
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/
];
function walk(dir, root, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, root, out);
    else if (e.isFile() && /\.(?:html|js|json|ts|jsx|tsx|sql|yml|yaml)$/i.test(e.name)) out.push(p);
  }
  return out;
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const files = walk(root, root);
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), issue: 'possible_hardcoded_secret', detail: 'Value redacted; inspect locally.' });
      pattern.lastIndex = 0;
    }
  }
  const vercelPath = path.join(root, 'vercel.json');
  let vercel = {};
  if (fs.existsSync(vercelPath)) {
    try { vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8')); } catch { findings.push({ file: 'vercel.json', issue: 'invalid_json' }); }
  }
  const headersText = JSON.stringify(vercel.headers || []);
  if (!/content-security-policy/i.test(headersText)) findings.push({ file: 'vercel.json', issue: 'csp_header_not_detected', severity: 'review' });
  const sqlFiles = files.filter(f => f.endsWith('.sql'));
  for (const file of sqlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (/create\s+policy[\s\S]{0,500}using\s*\(\s*true\s*\)/i.test(text)) {
      findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), issue: 'broad_rls_policy_requires_review' });
    }
  }
  const envNames = ['.env', '.env.local', '.env.production'];
  const envPresent = envNames.filter(n => fs.existsSync(path.join(root, n)));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), root,
    filesScanned: files.length, envFilesPresent: envPresent,
    envFileContentsRead: false,
    findings,
    note: 'Static checks only. This does not prove RLS correctness, JWT enforcement, absence of secrets, or runtime security.'
  }, null, 2));
  return findings.length ? 1 : 0;
}
if (require.main === module) process.exitCode = main();
