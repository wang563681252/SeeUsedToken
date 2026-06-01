import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseLogText } from "./parser.js";
import { defaultFileExtensions, expandPath } from "./paths.js";

const SOURCE_CONFIGS = [
  {
    id: "claude-code",
    displayName: "Claude Code",
    fileHints: ["claude", "claude-code"],
    paths: ["{home}/.claude/projects", "{home}/.claude"]
  },
  {
    id: "codex",
    displayName: "Codex",
    fileHints: ["codex"],
    paths: ["{home}/.codex/sessions", "{home}/.codex/history.jsonl"]
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    fileHints: ["gemini", "gemini-cli"],
    paths: ["{home}/.gemini", "{xdgConfigHome}/gemini"]
  },
  {
    id: "github-copilot-cli",
    displayName: "GitHub Copilot CLI",
    fileHints: ["github-copilot", "github-copilot-cli", "copilot-cli"],
    paths: ["{xdgConfigHome}/github-copilot", "{home}/.copilot"]
  },
  {
    id: "hermes",
    displayName: "Hermes",
    fileHints: ["hermes"],
    paths: ["{home}/.hermes", "{xdgDataHome}/hermes"]
  },
  {
    id: "kosmos",
    displayName: "Kosmos",
    fileHints: ["kosmos"],
    paths: ["{home}/.kosmos", "{xdgDataHome}/kosmos"]
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    fileHints: ["opencode", "open-code"],
    paths: ["{home}/.opencode", "{xdgDataHome}/opencode"]
  },
  {
    id: "openclaw",
    displayName: "OpenClaw",
    fileHints: ["openclaw", "open-claw"],
    paths: ["{home}/.openclaw", "{xdgDataHome}/openclaw"]
  },
  {
    id: "pi",
    displayName: "Pi",
    fileHints: ["pi"],
    paths: ["{home}/.pi", "{xdgDataHome}/pi"]
  },
  {
    id: "pm-studio",
    displayName: "PM Studio",
    fileHints: ["pm-studio", "pmstudio"],
    paths: ["{home}/.pm-studio", "{xdgDataHome}/pm-studio"]
  },
  {
    id: "vscode-copilot",
    displayName: "VS Code Copilot",
    fileHints: ["vscode-copilot", "copilot-chat", "github.copilot-chat"],
    paths: [
      "{appData}/Code/User/globalStorage/github.copilot-chat",
      "{appData}/Code/User/workspaceStorage",
      "{home}/Library/Application Support/Code/User/globalStorage/github.copilot-chat"
    ]
  }
];

export function createLogSourceAdapter(config) {
  return {
    id: config.id,
    displayName: config.displayName,
    fileHints: config.fileHints,
    defaultLogPaths(env = process.env) {
      return config.paths.map((candidate) => expandPath(candidate, env));
    },
    async discover(options = {}) {
      return discoverFiles(this, options);
    },
    async parse(filePath) {
      return parseFile(this, filePath);
    },
    normalize(entry, fileMetadata) {
      return parseLogText(this, fileMetadata, JSON.stringify(entry));
    },
    count(entry, fileMetadata) {
      return this.normalize(entry, fileMetadata);
    }
  };
}

export function getSourceAdapters() {
  return SOURCE_CONFIGS.map(createLogSourceAdapter);
}

export function getSourceAdapter(sourceId) {
  return getSourceAdapters().find((source) => source.id === sourceId) ?? null;
}

export async function getSourceRegistry(options = {}) {
  const selected = new Set(options.sourceIds ?? []);
  const adapters = getSourceAdapters().filter(
    (adapter) => selected.size === 0 || selected.has(adapter.id)
  );
  const usingSharedRoots = options.roots && adapters.length > 1;
  return Promise.all(
    adapters.map(async (adapter) => {
      const availability = await adapter.discover({
        ...options,
        filterBySource: options.filterBySource ?? usingSharedRoots
      });
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        defaultLogPaths: adapter.defaultLogPaths(options.env),
        available: availability.files.length > 0,
        files: availability.files,
        issues: availability.issues
      };
    })
  );
}

export async function scanSources(options = {}) {
  const selected = new Set(options.sourceIds ?? []);
  const adapters = getSourceAdapters().filter(
    (adapter) => selected.size === 0 || selected.has(adapter.id)
  );

  const records = [];
  const issues = [];

  for (const adapter of adapters) {
    const pathsBySource = options.pathsBySource?.[adapter.id];
    const usingSharedRoots = !pathsBySource && options.roots && adapters.length > 1;
    const discovery = await adapter.discover({
      ...options,
      roots: pathsBySource ?? options.roots,
      filterBySource: options.filterBySource ?? usingSharedRoots
    });
    issues.push(...discovery.issues);

    for (const filePath of discovery.files) {
      const parsed = await adapter.parse(filePath);
      records.push(...parsed.records);
      issues.push(...parsed.issues);
    }
  }

  return { records, issues };
}

export async function discoverFiles(adapter, options = {}) {
  const roots = options.roots ?? adapter.defaultLogPaths(options.env);
  const maxFiles = options.maxFiles ?? 500;
  const extensions = options.extensions ?? defaultFileExtensions();
  const filterBySource = options.filterBySource ?? false;
  const files = [];
  const issues = [];

  for (const root of roots) {
    const resolved = path.resolve(root);
    try {
      await collectLogFiles(resolved, files, extensions, maxFiles, {
        fileHints: filterBySource ? adapter.fileHints : null
      });
    } catch (error) {
      issues.push({
        sourceId: adapter.id,
        path: resolved,
        code: error.code === "ENOENT" ? "missing_path" : "inaccessible_path",
        message: error.code === "ENOENT" ? "Path does not exist." : "Path could not be read."
      });
    }
  }

  return { files: Array.from(new Set(files)).sort(), issues };
}

export async function parseFile(adapter, filePath) {
  try {
    const metadata = await fileMetadata(filePath);
    const text = await readFile(filePath, "utf8");
    const parsed = parseLogText(adapter, metadata, text);
    return {
      records: parsed.records,
      issues: parsed.issues.map((issue) => ({
        sourceId: adapter.id,
        filePath,
        ...issue
      }))
    };
  } catch (error) {
    return {
      records: [],
      issues: [
        {
          sourceId: adapter.id,
          filePath,
          code: "read_failed",
          message: "File could not be read."
        }
      ]
    };
  }
}

async function collectLogFiles(currentPath, files, extensions, maxFiles, options = {}) {
  if (files.length >= maxFiles) {
    return;
  }

  const info = await stat(currentPath);
  if (info.isFile()) {
    if (
      extensions.has(path.extname(currentPath).toLowerCase()) &&
      matchesFileHints(currentPath, options.fileHints)
    ) {
      files.push(currentPath);
    }
    return;
  }

  if (!info.isDirectory()) {
    return;
  }

  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= maxFiles) {
      return;
    }
    await collectLogFiles(
      path.join(currentPath, entry.name),
      files,
      extensions,
      maxFiles,
      options
    );
  }
}

function matchesFileHints(filePath, fileHints) {
  if (!fileHints || fileHints.length === 0) {
    return true;
  }

  const baseName = path
    .basename(filePath, path.extname(filePath))
    .replace(/[^a-z0-9.-]/giu, "-")
    .toLowerCase();
  const segments = new Set(baseName.split(/[-.]+/u).filter(Boolean));

  return fileHints.some((hint) => {
    const normalizedHint = hint.toLowerCase();
    return (
      baseName === normalizedHint ||
      baseName.startsWith(`${normalizedHint}-`) ||
      baseName.endsWith(`-${normalizedHint}`) ||
      baseName.includes(`-${normalizedHint}-`) ||
      segments.has(normalizedHint)
    );
  });
}

async function fileMetadata(filePath) {
  const info = await stat(filePath);
  return {
    path: path.resolve(filePath),
    sizeBytes: info.size,
    mtimeMs: info.mtimeMs
  };
}
