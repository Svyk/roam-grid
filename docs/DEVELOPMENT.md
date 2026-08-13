# Development

Everything in this file is for people working *on* Roam Grid. If you only want
to use it, install it from Roam Depot and read the [README](../README.md).

## Repository layout

`src/extension.js` is the only source file: browser-native ESM, zero
dependencies, no bundler, no imports. `node build.mjs` copies it to the root
`extension.js` with a version banner and assembles `deploy/` — the four public
files Roam loads (`README.md`, `extension.js`, `extension.css`, `CHANGELOG.md`)
plus `.nojekyll`.

`build.mjs` throws if `package.json`'s `version` and the `const VERSION` on line
1 of `src/extension.js` disagree, so a release bumps both together.

## Verification gate

```
npm run check
```

runs `node --check src/extension.js`, the `node:test` suite, the secret scan,
and the generated-artifact verify. `npm test` alone is not the gate. CI runs
`npm run build` then `npm run check` then `git diff --exit-code -- extension.js deploy`.

Because `deploy/` is listed in `.gitignore`, that artifact-diff step effectively
guards only the root `extension.js`; a stale `deploy/` cannot fail CI, and
`verify:generated` is what actually re-derives it from source.

## Install from the auto-updating URL

The public repository deploys a Roam-ready build to GitHub Pages after every
push to `main`. The extension root is:

[`https://svyk.github.io/roam-grid/`](https://svyk.github.io/roam-grid/)

In Roam, open **Settings → Roam Depot → Developer Extensions**, choose
**Load extension → URL**, and paste that root URL. URL extensions auto-start on
later Roam launches, so a pushed build does not require choosing the local
folder again. Developer extensions remain local to each Roam client.

For an immediate update after a push, wait for the GitHub Pages deployment and
press the circular reload button beside this URL. Hover the grid-size badge to
confirm the running version (for example, `Roam Grid v0.10.0`). Roam can reuse a
cached remote bundle during the same app session; if the badge still shows the
older version, remove only this developer-extension URL and add the same URL
again. The reinstall remounts the renderer and does not alter any table blocks,
saved templates, or `[[roam/grid/metadata]]`.

The four public files at that URL are `README.md`, `extension.js`,
`extension.css`, and `CHANGELOG.md`. `npm run build` assembles those exact files
in `deploy/`, and GitHub Actions publishes that directory without any deploy
keys or long-lived secrets.

The release workflow is: run the tests and `npm run build`, push the release
branch, wait for the GitHub Pages workflow to complete, then reload the same URL
entry in Depot developer mode. No reinstall or graph migration is required, and
a reload preserves native cell blocks, table metadata, and large-grid manifests.

## Install for local development

1. Run `npm run build` in this folder.
2. In Roam, open **Settings → Roam Depot → Developer Extensions**.
3. Load this folder once as a local extension.
4. After later builds, press `Ctrl-D`, then `Ctrl-R`, or reload developer
   extensions from the Roam Depot settings panel.

For continuous builds, run `npm run dev` and use the same reload shortcut after
an edit. Roam intentionally cannot auto-start a local-folder extension after a
full page/app reload because the browser requires a fresh user gesture for file
access. Press `Ctrl-D`, then `Ctrl-R`, or use the URL install above. This is an
installation-mode limitation—not lost table data or metadata.

The extension deliberately does not use `roam/js`.

## Depot submission

The Depot metadata file is drafted at
[`depot/extensions/Svyk/roam-grid.json`](../depot/extensions/Svyk/roam-grid.json).
It is not the published copy: submitting means forking
`Roam-Research/roam-depot` and adding that file at `extensions/Svyk/roam-grid.json`
in the fork. `source_commit` is a placeholder in the draft and must be replaced
with the exact commit a reviewer will read.

### Pre-submission checklist

Steps 1–9 are done in this repository. Step 10 is an external action and has
**not** been taken.

1. **Version agreement** — `package.json`, the `const VERSION` on line 1 of
   `src/extension.js`, and the README all read the same version: the README's
   first body line is `Version 0.17.0`, matching `package.json`.
   `node build.mjs` enforces the first two.
2. **Gate green** — `npm run check` passes: syntax check, full `node:test` suite,
   secret scan, generated-artifact verify.
3. **Artifacts rebuilt** — `node build.mjs` has run since the last source edit,
   so root `extension.js` and `deploy/` match `src/extension.js`.
4. **Changelog** — `CHANGELOG.md` has a user-facing entry for this version. Every
   Depot update bumps `source_commit`, so the changelog is the reviewer's diff
   summary.
5. **README is the product page** — Roam renders `README.md` in the Depot listing.
   It must describe what the extension does and, specifically, everything it
   writes to the graph. No "not ready for release" language.
6. **Lifecycle** — `onunload` removes every command, listener, observer, pull
   watch, timer, portal observer, dialog, style guard, and the public API, and
   restores the native Roam table renderer. `test/lifecycle.test.js` covers this.
7. **No graph writes on install** — `[[roam/grid/metadata]]` is created lazily on
   the first table enhancement, not during `onload`.
8. **Safety surface** — no `eval`, no `new Function`, no `fetch`/`XMLHttpRequest`,
   no external imports, no telemetry. All datalog is `:in`-parameterized; no uid
   is interpolated into a query string. Both `innerHTML` sinks are
   extension-authored constant markup.
9. **CSS scoping** — every rule in `extension.css` has a `.rg-*` class as its
   subject, except one documented pre-paint rule for the extension's own
   `roam-grid-range` component. The lint test at the end of
   `test/range-reference.test.js` enforces that count and requires the exception
   to stay documented in `docs/ARCHITECTURE.md`.
10. **Open the PR against `Roam-Research/roam-depot`** — **NOT DONE.** Requires
    forking the Depot repository, copying the draft metadata to
    `extensions/Svyk/roam-grid.json`, replacing `source_commit` with the real
    commit SHA, and opening a pull request. This is an external, public action
    and needs an explicit decision before it is taken.

## Repository facts worth knowing before submitting

- The git author email on this repository's commits is
  `svyatoslavkleshchev@gmail.com`, which differs from the address used elsewhere
  in the author's tooling. It is what a reviewer will see in the commit history.
- `deploy/` is gitignored. It is published to GitHub Pages by the Pages workflow
  from a fresh build, and it is never committed.
