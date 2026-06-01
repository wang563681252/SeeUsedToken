export function aggregateUsage(records) {
  const deduped = dedupeRecords(records);
  const byDaySourceModel = new Map();
  const totals = emptyTotals();

  for (const record of deduped) {
    addRecord(totals, record);
    const day = record.timestamp.slice(0, 10);
    const model = record.model ?? "unknown";
    const key = `${day}\u0000${record.sourceId}\u0000${model}`;

    if (!byDaySourceModel.has(key)) {
      byDaySourceModel.set(key, {
        day,
        sourceId: record.sourceId,
        sourceName: record.sourceName,
        model,
        ...emptyTotals()
      });
    }

    addRecord(byDaySourceModel.get(key), record);
  }

  return {
    totals,
    groups: Array.from(byDaySourceModel.values()).sort((left, right) =>
      `${left.day}:${left.sourceId}:${left.model}`.localeCompare(
        `${right.day}:${right.sourceId}:${right.model}`
      )
    )
  };
}

function dedupeRecords(records) {
  const seen = new Set();
  const deduped = [];

  for (const record of records) {
    const key = [
      record.sourceId,
      record.sourceFile?.path,
      record.timestamp,
      record.model,
      record.inputTokens,
      record.outputTokens,
      record.totalTokens,
      record.countingMethod
    ].join("\u0000");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(record);
    }
  }

  return deduped;
}

function emptyTotals() {
  return {
    records: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    exactRecords: 0,
    estimatedRecords: 0,
    exactTokens: 0,
    estimatedTokens: 0
  };
}

function addRecord(target, record) {
  target.records += 1;
  target.inputTokens += record.inputTokens;
  target.outputTokens += record.outputTokens;
  target.totalTokens += record.totalTokens;

  if (record.countingMethod === "exact") {
    target.exactRecords += 1;
    target.exactTokens += record.totalTokens;
  } else {
    target.estimatedRecords += 1;
    target.estimatedTokens += record.totalTokens;
  }
}
