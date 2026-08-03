import { copyFile, mkdir, readFile, writeFile, watch } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const source = resolve(root, "src/extension.js");
const target = resolve(root, "extension.js");
const deploy = resolve(root, "deploy");
const banner = `/* Roam Grid v0.4.0 | MIT | generated from src/extension.js */\n`;

async function build() {
  const code = await readFile(source, "utf8");
  await writeFile(target, `${banner}${code}`, "utf8");
  await mkdir(deploy, { recursive: true });
  await Promise.all(["extension.js", "extension.css", "README.md", "CHANGELOG.md"].map((name) => copyFile(resolve(root, name), resolve(deploy, name))));
  await writeFile(resolve(deploy, ".nojekyll"), "", "utf8");
  process.stdout.write(`Built ${target}\n`);
}

await build();

if (process.argv.includes("--watch")) {
  const watcher = watch(source);
  for await (const event of watcher) {
    if (event.eventType === "change") await build();
  }
}
