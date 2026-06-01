export { aggregateUsage } from "./aggregate.js";
export {
  createLogSourceAdapter,
  discoverFiles,
  getSourceAdapter,
  getSourceAdapters,
  getSourceRegistry,
  parseFile,
  scanSources
} from "./sources.js";
export { estimateTokens } from "./tokenizer.js";

/**
 * @typedef {Object} LogSourceAdapter
 * @property {string} id
 * @property {string} displayName
 * @property {(env?: NodeJS.ProcessEnv) => string[]} defaultLogPaths
 * @property {(options?: object) => Promise<{files: string[], issues: object[]}>} discover
 * @property {(filePath: string) => Promise<{records: TokenUsageRecord[], issues: object[]}>} parse
 * @property {(entry: object, fileMetadata: object) => {records: TokenUsageRecord[], issues: object[]}} normalize
 * @property {(entry: object, fileMetadata: object) => {records: TokenUsageRecord[], issues: object[]}} count
 */

/**
 * @typedef {Object} TokenUsageRecord
 * @property {string} sourceId
 * @property {string} sourceName
 * @property {string} timestamp
 * @property {string | null} model
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} totalTokens
 * @property {"exact" | "estimated"} countingMethod
 * @property {{path: string, sizeBytes: number, mtimeMs: number}} sourceFile
 */
