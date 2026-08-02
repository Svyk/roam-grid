import { readFile, writeFile, watch } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const source = resolve(root, "src/extension.js");
const target = resolve(root, "extension.js");
const banner = `/* Roam Grid v0.1.0 | MIT | generated from src/extension.js */\n`;

async function build() {
  const code = await readFile(source, "utf8");
  await writeFile(target, `${banner}${code}`, "utf8");
  process.stdout.write(`Built ${target}\n`);
}

await build();

if (process.argv.includes("--watch")) {
  const watcher = watch(source);
  for await (const event of watcher) {
    if (event.eventType === "change") await build();
  }
}

