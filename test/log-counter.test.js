import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  aggregateUsage,
  getSourceAdapter,
  getSourceAdapters,
  getSourceRegistry,
  scanSources
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

test("registers every supported source", () => {
  assert.deepEqual(
    getSourceAdapters().map((source) => source.id),
    [
      "claude-code",
      "codex",
      "gemini-cli",
      "github-copilot-cli",
      "hermes",
      "kosmos",
      "opencode",
      "openclaw",
      "pi",
      "pm-studio",
      "vscode-copilot"
    ]
  );
});

test("each adapter parses its synthetic fixture", async () => {
  for (const adapter of getSourceAdapters()) {
    const parsed = await adapter.parse(path.join(fixturesDir, `${adapter.id}.jsonl`));

    assert.equal(parsed.records.length, 1, adapter.id);
    assert.equal(parsed.records[0].sourceId, adapter.id);
    assert.equal(parsed.records[0].sourceName, adapter.displayName);
    assert.ok(parsed.records[0].totalTokens > 0);
    assert.match(parsed.records[0].timestamp, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(parsed.records[0].sourceFile.path.includes("fixtures"), true);
    assert.equal(
      JSON.stringify(parsed.records).includes("SYNTHETIC_PROMPT_DO_NOT_PERSIST"),
      false
    );
    assert.equal(
      JSON.stringify(parsed.records).includes("SYNTHETIC_RESPONSE_DO_NOT_PERSIST"),
      false
    );
  }
});

test("classifies exact and estimated token counts", async () => {
  const exact = await getSourceAdapter("claude-code").parse(
    path.join(fixturesDir, "claude-code.jsonl")
  );
  const estimated = await getSourceAdapter("codex").parse(path.join(fixturesDir, "codex.jsonl"));

  assert.equal(exact.records[0].countingMethod, "exact");
  assert.equal(exact.records[0].inputTokens, 12);
  assert.equal(exact.records[0].outputTokens, 8);
  assert.equal(exact.records[0].totalTokens, 20);

  assert.equal(estimated.records[0].countingMethod, "estimated");
  assert.ok(estimated.records[0].inputTokens > 0);
  assert.ok(estimated.records[0].outputTokens > 0);
});

test("uses one exact usage container without double-counting cached or cumulative tokens", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "see-used-token-"));
  const filePath = path.join(tempDir, "codex-rollout.jsonl");
  await writeFile(
    filePath,
    JSON.stringify({
      timestamp: "2026-05-31T20:00:00.000Z",
      payload: {
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 80,
            output_tokens: 10,
            total_tokens: 110
          },
          last_token_usage: {
            input_tokens: 20,
            cached_input_tokens: 15,
            output_tokens: 5,
            total_tokens: 25
          }
        }
      }
    })
  );

  const parsed = await getSourceAdapter("codex").parse(filePath);

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].countingMethod, "exact");
  assert.equal(parsed.records[0].inputTokens, 20);
  assert.equal(parsed.records[0].outputTokens, 5);
  assert.equal(parsed.records[0].totalTokens, 25);
});

test("does not estimate text entries from a file that already has exact usage", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "see-used-token-"));
  const filePath = path.join(tempDir, "mixed.jsonl");
  await writeFile(
    filePath,
    [
      JSON.stringify({
        timestamp: "2026-05-31T21:00:00.000Z",
        prompt: "SYNTHETIC_PROMPT_DO_NOT_PERSIST should not be counted separately"
      }),
      JSON.stringify({
        timestamp: "2026-05-31T21:00:01.000Z",
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      })
    ].join("\n")
  );

  const parsed = await getSourceAdapter("codex").parse(filePath);

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].countingMethod, "exact");
  assert.equal(parsed.records[0].totalTokens, 5);
  assert.equal(
    JSON.stringify(parsed.records).includes("SYNTHETIC_PROMPT_DO_NOT_PERSIST"),
    false
  );
});

test("reports missing paths without throwing", async () => {
  const registry = await getSourceRegistry({
    roots: [path.join(fixturesDir, "does-not-exist")]
  });

  assert.equal(registry.length, 11);
  assert.equal(registry.every((source) => source.available === false), true);
  assert.equal(registry.every((source) => source.issues[0].code === "missing_path"), true);
});

test("shared root discovery does not assign every file to every source", async () => {
  const registry = await getSourceRegistry({
    roots: [fixturesDir]
  });
  const result = await scanSources({
    roots: [fixturesDir]
  });

  assert.equal(registry.length, 11);
  assert.equal(registry.every((source) => source.files.length === 1), true);
  assert.equal(result.records.length, 11);
  assert.deepEqual(
    result.records.map((record) => record.sourceId).sort(),
    getSourceAdapters().map((source) => source.id).sort()
  );
});

test("single-source explicit root can parse arbitrary file names", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "see-used-token-"));
  const filePath = path.join(tempDir, "history.jsonl");
  await writeFile(
    filePath,
    '{"timestamp":"2026-05-31T19:00:00.000Z","usage":{"prompt_tokens":2,"completion_tokens":3}}\n'
  );

  const result = await scanSources({
    sourceIds: ["codex"],
    roots: [tempDir]
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sourceId, "codex");
  assert.equal(result.records[0].totalTokens, 5);
});

test("direct parse reports missing files as issues", async () => {
  const parsed = await getSourceAdapter("codex").parse(
    path.join(fixturesDir, "missing-file.jsonl")
  );

  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0].code, "read_failed");
});

test("reports malformed and unsupported log entries without leaking content", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "see-used-token-"));
  const filePath = path.join(tempDir, "bad.jsonl");
  await writeFile(
    filePath,
    '{"prompt":"SYNTHETIC_PROMPT_DO_NOT_PERSIST"}\nnot-json\n{"event":"metadata-only"}\n'
  );

  const adapter = getSourceAdapter("codex");
  const parsed = await adapter.parse(filePath);
  const serializedIssues = JSON.stringify(parsed.issues);

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.issues.some((issue) => issue.code === "malformed_json_line"), true);
  assert.equal(serializedIssues.includes("SYNTHETIC_PROMPT_DO_NOT_PERSIST"), false);
});

test("aggregates by day, source, model, and exactness without conversation content", async () => {
  const result = await scanSources({
    sourceIds: ["claude-code", "codex"],
    pathsBySource: {
      "claude-code": [path.join(fixturesDir, "claude-code.jsonl")],
      codex: [path.join(fixturesDir, "codex.jsonl")]
    }
  });
  const aggregate = aggregateUsage([...result.records, ...result.records]);
  const serialized = JSON.stringify(aggregate);

  assert.equal(aggregate.totals.records, 2);
  assert.equal(aggregate.totals.exactRecords, 1);
  assert.equal(aggregate.totals.estimatedRecords, 1);
  assert.equal(aggregate.groups.length, 2);
  assert.equal(serialized.includes("SYNTHETIC_PROMPT_DO_NOT_PERSIST"), false);
  assert.equal(serialized.includes("SYNTHETIC_RESPONSE_DO_NOT_PERSIST"), false);
});
