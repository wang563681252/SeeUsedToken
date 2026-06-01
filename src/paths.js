import { homedir } from "node:os";
import path from "node:path";

export function expandPath(template, env = process.env) {
  const replacements = {
    "{home}": env.HOME || env.USERPROFILE || homedir(),
    "{appData}": env.APPDATA || path.join(env.USERPROFILE || homedir(), "AppData", "Roaming"),
    "{localAppData}":
      env.LOCALAPPDATA || path.join(env.USERPROFILE || homedir(), "AppData", "Local"),
    "{xdgConfigHome}": env.XDG_CONFIG_HOME || path.join(env.HOME || homedir(), ".config"),
    "{xdgDataHome}": env.XDG_DATA_HOME || path.join(env.HOME || homedir(), ".local", "share")
  };

  let expanded = template;
  for (const [token, value] of Object.entries(replacements)) {
    expanded = expanded.replaceAll(token, value);
  }

  return path.resolve(expanded);
}

export function defaultFileExtensions() {
  return new Set([".json", ".jsonl", ".ndjson", ".log", ".txt"]);
}
