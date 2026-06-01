import { estimateTokens } from "./tokenizer.js";

const INPUT_KEYS = new Set([
  "inputtokens",
  "inputtoken",
  "prompttokens",
  "prompttoken",
  "prompttokencount"
]);

const OUTPUT_KEYS = new Set([
  "outputtokens",
  "outputtoken",
  "completiontokens",
  "completiontoken",
  "candidatestokens",
  "candidatestokencount",
  "responsetokens",
  "responsetoken",
  "generatedtokens"
]);

const TOTAL_KEYS = new Set([
  "totaltokens",
  "totaltoken",
  "totaltokencount",
  "tokencount",
  "tokensused"
]);

const INPUT_TEXT_KEYS = new Set(["prompt", "input", "request", "query"]);
const OUTPUT_TEXT_KEYS = new Set(["completion", "response", "output", "answer"]);
const GENERIC_TEXT_KEYS = new Set(["content", "text", "message"]);

export function parseLogText(adapter, fileMetadata, text) {
  const issues = [];
  const entries = readEntries(text, issues);
  const records = [];

  for (const [index, entry] of entries.entries()) {
    const record = normalizeEntry(adapter, fileMetadata, entry, index);
    if (record) {
      records.push(record);
    }
  }

  const exactRecords = records.filter((record) => record.countingMethod === "exact");
  if (exactRecords.length > 0) {
    return { records: exactRecords, issues };
  }

  if (entries.length > 0 && records.length === 0) {
    issues.push({
      sourceId: adapter.id,
      filePath: fileMetadata.path,
      code: "unsupported_schema",
      message: "No token usage or countable text fields were found."
    });
  }

  return { records, issues };
}

export function normalizeEntry(adapter, fileMetadata, entry, index = 0) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const tokenUsage = extractExactTokens(entry) ?? extractEstimatedTokens(entry);
  if (!tokenUsage) {
    return null;
  }

  const timestamp = findFirstString(entry, [
    "timestamp",
    "time",
    "date",
    "created_at",
    "createdAt",
    "started_at",
    "startedAt"
  ]);

  const model =
    findFirstString(entry, ["model", "model_name", "modelName", "engine"]) ??
    null;

  return {
    sourceId: adapter.id,
    sourceName: adapter.displayName,
    timestamp: normalizeTimestamp(timestamp, fileMetadata.mtimeMs, index),
    model,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    totalTokens: tokenUsage.totalTokens,
    countingMethod: tokenUsage.countingMethod,
    sourceFile: fileMetadata
  };
}

function readEntries(text, issues) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const json = tryJson(trimmed);
  if (json.ok) {
    return flattenLogContainer(json.value);
  }

  const lineEntries = [];
  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    const candidate = line.trim();
    if (!candidate) {
      continue;
    }

    const parsed = tryJson(candidate);
    if (parsed.ok) {
      lineEntries.push(...flattenLogContainer(parsed.value));
    } else {
      issues.push({
        code: "malformed_json_line",
        line: lineIndex + 1,
        message: "Line could not be parsed as JSON."
      });
    }
  }

  return lineEntries;
}

function tryJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function flattenLogContainer(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenLogContainer(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  for (const key of ["records", "entries", "events", "logs"]) {
    if (Array.isArray(value[key])) {
      return value[key].flatMap((item) => flattenLogContainer(item));
    }
  }

  return [value];
}

function extractExactTokens(entry) {
  const usage = findUsageContainer(entry);
  const inputTokens = sumDirectNumericKeys(usage, INPUT_KEYS);
  const outputTokens = sumDirectNumericKeys(usage, OUTPUT_KEYS);
  const explicitTotal = sumDirectNumericKeys(usage, TOTAL_KEYS);

  if (inputTokens === null && outputTokens === null && explicitTotal === null) {
    return null;
  }

  const safeInput = inputTokens ?? 0;
  const safeOutput = outputTokens ?? 0;
  return {
    inputTokens: safeInput,
    outputTokens: safeOutput,
    totalTokens: explicitTotal ?? safeInput + safeOutput,
    countingMethod: "exact"
  };
}

function extractEstimatedTokens(entry) {
  const model =
    findFirstString(entry, ["model", "model_name", "modelName", "engine"]) ??
    undefined;
  const messages = findFirstArray(entry, ["messages", "turns"]);

  if (messages) {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const message of messages) {
      if (!message || typeof message !== "object") {
        continue;
      }

      const content = pickTextPayload(message);
      if (!content) {
        continue;
      }

      const count = estimateTokens(content, model);
      const role = String(message.role ?? message.author ?? "").toLowerCase();
      if (role.includes("assistant") || role.includes("model")) {
        outputTokens += count;
      } else {
        inputTokens += count;
      }
    }

    if (inputTokens > 0 || outputTokens > 0) {
      return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        countingMethod: "estimated"
      };
    }
  }

  const textUsage = extractTextFields(entry, model);
  if (!textUsage) {
    return null;
  }

  return {
    ...textUsage,
    countingMethod: "estimated"
  };
}

function extractTextFields(value, model) {
  let inputTokens = 0;
  let outputTokens = 0;

  walk(value, (node, key) => {
    if (typeof node !== "string" || !node.trim()) {
      return;
    }

    const normalized = normalizeKey(key);
    if (INPUT_TEXT_KEYS.has(normalized)) {
      inputTokens += estimateTokens(node, model);
    } else if (OUTPUT_TEXT_KEYS.has(normalized)) {
      outputTokens += estimateTokens(node, model);
    } else if (GENERIC_TEXT_KEYS.has(normalized)) {
      inputTokens += estimateTokens(node, model);
    }
  });

  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

function findUsageContainer(entry) {
  return (
    findFirstObject(entry, [
      "usage",
      "token_usage",
      "tokenUsage",
      "last_token_usage",
      "lastTokenUsage",
      "total_token_usage",
      "totalTokenUsage",
      "metrics",
      "stats"
    ]) ?? entry
  );
}

function sumDirectNumericKeys(value, keySet) {
  let total = 0;
  let found = false;

  for (const [key, node] of Object.entries(value ?? {})) {
    if (typeof node !== "number" || !Number.isFinite(node)) {
      continue;
    }

    if (keySet.has(normalizeKey(key))) {
      total += Math.max(0, Math.trunc(node));
      found = true;
    }
  }

  return found ? total : null;
}

function findFirstString(value, keys) {
  const normalizedKeys = new Set(keys.map(normalizeKey));
  let found = null;
  walk(value, (node, key) => {
    if (found !== null || typeof node !== "string") {
      return;
    }

    if (normalizedKeys.has(normalizeKey(key))) {
      found = node;
    }
  });
  return found;
}

function findFirstArray(value, keys) {
  const normalizedKeys = new Set(keys.map(normalizeKey));
  let found = null;
  walk(value, (node, key) => {
    if (found || !Array.isArray(node)) {
      return;
    }

    if (normalizedKeys.has(normalizeKey(key))) {
      found = node;
    }
  });
  return found;
}

function findFirstObject(value, keys) {
  for (const key of keys) {
    const found = findObjectByKey(value, normalizeKey(key));
    if (found) {
      return found;
    }
  }

  return null;
}

function findObjectByKey(value, targetKey) {
  let found = null;
  walk(value, (node, key) => {
    if (found || !node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }

    if (normalizeKey(key) === targetKey) {
      found = node;
    }
  });
  return found;
}

function pickTextPayload(value) {
  for (const key of ["content", "text", "message", "parts"]) {
    if (value[key]) {
      return value[key];
    }
  }

  return null;
}

function normalizeTimestamp(value, fallbackMtimeMs, offset) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  const date = Number.isNaN(parsed)
    ? new Date((fallbackMtimeMs || Date.now()) + offset)
    : new Date(parsed);
  return date.toISOString();
}

function walk(value, visitor, key = "") {
  visitor(value, key);

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visitor, key);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      walk(childValue, visitor, childKey);
    }
  }
}

function normalizeKey(key) {
  return String(key).replace(/[^a-z0-9]/giu, "").toLowerCase();
}
