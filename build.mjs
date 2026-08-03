import { copyFile, mkdir, readFile, writeFile, watch } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const source = resolve(root, "src/extension.js");
const target = resolve(root, "extension.js");
const deploy = resolve(root, "deploy");
const packageMetadata = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageMetadata.version || "");
const banner = `/* Roam Grid v${version} | MIT | generated from src/extension.js */\n`;

async function build() {
  const code = await readFile(source, "utf8");
  const sourceVersion = /^const VERSION = "([^"]+)";/m.exec(code)?.[1];
  if (!version || sourceVersion !== version) throw new Error(`Version mismatch: package.json=${version || "missing"}, src/extension.js=${sourceVersion || "missing"}`);
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
