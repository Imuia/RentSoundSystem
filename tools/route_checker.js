'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('./schema_validator');

const SKIP = new Set(['.git', 'node_modules', '.vercel', 'staging', 'logs', 'uploads']);
function walk(dir, root, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(path.relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const html = walk(root, root);
  const sitemapPath = path.join(root, 'sitemap.xml');
  const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
  const urls = [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m => m[1].trim());
  const routesFile = path.join(root, 'routes.json');
  const routes = readJson(routesFile);
  const candidates = [];
  const missing = [];
  for (const url of urls) {
    let pathname;
    try { pathname = new URL(url).pathname; } catch { pathname = url.split('?')[0]; }
    const clean = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '');
    const possibilities = clean === ''
      ? ['index.html']
      : [`${clean}.html`, `${clean}/index.html`, `${clean}/index.htm`];
    const found = possibilities.find(p => html.includes(p));
    const item = { url, file: found || null, status: found ? 'FOUND' : 'UNMAPPED_PHYSICAL_FILE' };
    (found ? candidates : missing).push(item);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    root,
    htmlFilesFound: html.length,
    sitemapUrlsFound: urls.length,
    routesJsonPresent: !!routes,
    note: 'A missing physical-file mapping is not proof of an HTTP 404; Vercel rewrites, functions, and dynamic routes must be checked separately.',
    mapped: candidates,
    unmapped: missing
  };
  console.log(JSON.stringify(report, null, 2));
  return missing.length ? 1 : 0;
}
if (require.main === module) process.exitCode = main();
module.exports = { walk };
