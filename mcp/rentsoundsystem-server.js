"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TOOLS = path.join(ROOT, "tools");
const REPORTS = path.join(ROOT, "staging", "rssautomation");
const LOCK = path.join(ROOT, ".safety_lock");

const SDK = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "@mnemosyne_os",
  "mcp",
  "node_modules",
  "@modelcontextprotocol",
  "sdk"
);

const { Server } = require(path.join(SDK, "dist/cjs/server/index.js"));
const { StdioServerTransport } = require(
  path.join(SDK, "dist/cjs/server/stdio.js")
);
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require(path.join(SDK, "dist/cjs/types.js"));

const server = new Server(
  { name: "rentsoundsystem-automation", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

function checkSafety() {
  if (!fs.existsSync(LOCK)) {
    throw new Error("SAFETY_LOCK absent : opération interdite.");
  }
}

function latestReport() {
  if (!fs.existsSync(REPORTS)) return null;

  const files = fs.readdirSync(REPORTS)
    .filter(f => /^rss-audit-.*\.json$/.test(f))
    .map(f => ({
      name: f,
      full: path.join(REPORTS, f),
      time: fs.statSync(path.join(REPORTS, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (!files.length) return null;

  return JSON.parse(fs.readFileSync(files[0].full, "utf8"));
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "rss_get_status",
      description: "Vérifie les scripts, le verrou de sécurité et les rapports RSSAutomation.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "rss_run_audit",
      description: "Lance les quatre audits RSSAutomation en lecture seule. Aucun déploiement ni publication.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "rss_get_latest_report",
      description: "Récupère le dernier rapport JSON RSSAutomation.",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const name = request.params.name;

    if (name === "rss_get_status") {
      const scripts = [
        "rss_master_orchestrator.js",
        "route_checker.js",
        "asset_validator.js",
        "security_audit.js",
        "perf_validator.js",
        "schema_validator.js"
      ];

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            project: "RentSoundSystem",
            safetyLock: fs.existsSync(LOCK),
            scripts: Object.fromEntries(
              scripts.map(s => [s, fs.existsSync(path.join(TOOLS, s))])
            ),
            reportDirectoryExists: fs.existsSync(REPORTS),
            latestReportAvailable: !!latestReport()
          }, null, 2)
        }]
      };
    }

    if (name === "rss_get_latest_report") {
      checkSafety();
      const report = latestReport();

      return {
        content: [{
          type: "text",
          text: report
            ? JSON.stringify(report, null, 2)
            : "Aucun rapport RSSAutomation disponible."
        }]
      };
    }

    if (name === "rss_run_audit") {
      checkSafety();

      const script = path.join(TOOLS, "rss_master_orchestrator.js");
      if (!fs.existsSync(script)) throw new Error("Orchestrateur introuvable.");

      const result = spawnSync(
        process.execPath,
        [script, "--root", ROOT],
        {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
          shell: false
        }
      );

      const report = latestReport();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            exitCode: result.status,
            executionError: result.error?.message || null,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            report
          }, null, 2)
        }],
        isError: result.status !== 0 || !!result.error
      };
    }

    throw new Error("Outil inconnu : " + name);
  } catch (error) {
    return {
      content: [{ type: "text", text: error.message }],
      isError: true
    };
  }
});

async function main() {
  checkSafety();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  console.error("RSSAutomation MCP:", error.message);
  process.exit(1);
});
