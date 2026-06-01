#!/usr/bin/env node
import { aggregateUsage, getSourceRegistry, scanSources } from "./index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "scan";

try {
  if (command === "sources") {
    const registry = await getSourceRegistry(parseOptions(args.slice(1)));
    printJson(registry);
  } else if (command === "scan") {
    const options = parseOptions(args.slice(1));
    const result = await scanSources(options);
    const payload = {
      records: result.records,
      aggregate: aggregateUsage(result.records),
      issues: result.issues
    };
    printJson(options.summary ? summarizeScan(payload) : payload);
  } else if (command === "monitor") {
    const options = parseOptions(args.slice(1));
    const intervalMs = options.intervalMs ?? 30_000;
    do {
      const result = await scanSources(options);
      printJson(
        summarizeScan({
          records: result.records,
          aggregate: aggregateUsage(result.records),
          issues: result.issues
        })
      );
      if (options.once) {
        break;
      }
      await delay(intervalMs);
    } while (true);
  } else if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseOptions(rawArgs) {
  const sourceIds = [];
  const roots = [];
  const pathsBySource = {};
  let maxFiles;
  let intervalMs;
  let once = false;
  let summary = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--source") {
      sourceIds.push(rawArgs[++index]);
    } else if (arg === "--path") {
      roots.push(rawArgs[++index]);
    } else if (arg === "--source-path") {
      const value = rawArgs[++index];
      const separator = value.indexOf("=");
      if (separator === -1) {
        throw new Error("--source-path expects source-id=path");
      }
      const sourceId = value.slice(0, separator);
      const filePath = value.slice(separator + 1);
      pathsBySource[sourceId] ??= [];
      pathsBySource[sourceId].push(filePath);
    } else if (arg === "--max-files") {
      maxFiles = Number.parseInt(rawArgs[++index], 10);
      if (!Number.isFinite(maxFiles) || maxFiles < 1) {
        throw new Error("--max-files expects a positive integer");
      }
    } else if (arg === "--interval-ms") {
      intervalMs = Number.parseInt(rawArgs[++index], 10);
      if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
        throw new Error("--interval-ms expects an integer >= 1000");
      }
    } else if (arg === "--once") {
      once = true;
    } else if (arg === "--summary") {
      summary = true;
    }
  }

  const explicitSourceIds = new Set(sourceIds.filter(Boolean));
  for (const sourceId of Object.keys(pathsBySource)) {
    explicitSourceIds.add(sourceId);
  }

  return {
    sourceIds: Array.from(explicitSourceIds),
    roots: roots.length > 0 ? roots : undefined,
    pathsBySource: Object.keys(pathsBySource).length > 0 ? pathsBySource : undefined,
    maxFiles,
    intervalMs,
    once,
    summary
  };
}

function summarizeScan(payload) {
  const issuesByCode = {};
  for (const issue of payload.issues) {
    issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    records: payload.aggregate.totals.records,
    totals: payload.aggregate.totals,
    groups: payload.aggregate.groups,
    issues: {
      total: payload.issues.length,
      byCode: issuesByCode
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`SeeUsedToken

Usage:
  node src/cli.js sources
  node src/cli.js scan [--source id] [--path path] [--source-path id=path]
  node src/cli.js monitor [--source id] [--interval-ms 30000]

Commands:
  sources   List supported local log sources and discovered files.
  scan      Read local logs, count tokens, and print metadata-only JSON.
  monitor   Repeat scans and print metadata-only summary snapshots.

Privacy:
  Prompt, response, and conversation text is never written to output.
`);
}
