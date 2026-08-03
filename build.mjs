import { copyFile, mkdir, readFile, writeFile, watch } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const root = resolve(import.meta.dirname);

export async function renderArtifacts(rootDirectory = root) {
  const metadata = JSON.parse(await readFile(resolve(rootDirectory, "package.json"), "utf8"));
  const code = await readFile(resolve(rootDirectory, "src/extension.js"), "utf8");
  const version = String(metadata.version || "");
  const sourceVersion = /^const VERSION = "([^"]+)";/m.exec(code)?.[1];
  if (!version || sourceVersion !== version) throw new Error(`Version mismatch: package.json=${version || "missing"}, src/extension.js=${sourceVersion || "missing"}`);
  return {
    javascript: `/* Roam Grid v${version} | MIT | generated from src/extension.js */\n${code}`,
    css: await readFile(resolve(rootDirectory, "extension.css"), "utf8"),
  };
}

export async function build(rootDirectory = root) {
  const artifacts = await renderArtifacts(rootDirectory);
  const deploy = resolve(rootDirectory, "deploy");
  await writeFile(resolve(rootDirectory, "extension.js"), artifacts.javascript, "utf8");
  await mkdir(deploy, { recursive: true });
  await Promise.all([
    writeFile(resolve(deploy, "extension.js"), artifacts.javascript, "utf8"),
    writeFile(resolve(deploy, "extension.css"), artifacts.css, "utf8"),
    ...["README.md", "CHANGELOG.md"].map((name) => copyFile(resolve(rootDirectory, name), resolve(deploy, name))),
    writeFile(resolve(deploy, ".nojekyll"), "", "utf8"),
  ]);
  process.stdout.write(`Built ${resolve(rootDirectory, "extension.js")}\n`);
}

export async function verifyGeneratedArtifacts(rootDirectory = root) {
  const expected = await renderArtifacts(rootDirectory);
  const pairs = [
    ["extension.js", expected.javascript], ["deploy/extension.js", expected.javascript],
    ["deploy/extension.css", expected.css],
    ["deploy/README.md", await readFile(resolve(rootDirectory, "README.md"), "utf8")],
    ["deploy/CHANGELOG.md", await readFile(resolve(rootDirectory, "CHANGELOG.md"), "utf8")],
  ];
  for (const [name, content] of pairs) {
    if (await readFile(resolve(rootDirectory, name), "utf8") !== content) throw new Error(`Generated artifact drift: ${name}`);
  }
}

async function main() {
  await build();
  if (!process.argv.includes("--watch")) return;
  for await (const event of watch(resolve(root, "src/extension.js"))) {
    if (event.eventType === "change") await build();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === thisFile) await main();
