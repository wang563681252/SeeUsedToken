const MODEL_ESTIMATORS = [
  {
    match: /gpt|codex|copilot|openai|claude|gemini/i,
    charsPerToken: 4
  }
];

export function estimateTokens(value, model) {
  const text = collectText(value).join(" ");
  if (!text.trim()) {
    return 0;
  }

  const estimator =
    MODEL_ESTIMATORS.find((candidate) => model && candidate.match.test(model)) ??
    { charsPerToken: 4 };

  const wordish = text.trim().split(/\s+/u).filter(Boolean).length;
  const charBased = Math.ceil(text.length / estimator.charsPerToken);
  return Math.max(1, Math.max(wordish, charBased));
}

export function collectText(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectText(item));
  }

  return [];
}
