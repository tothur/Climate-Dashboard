import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readProjectFile(path) {
  return await readFile(resolve(ROOT_DIR, path), "utf8");
}

test("daily updater verifies once and commits every generated fallback artifact", async () => {
  const [workflow, packageJsonText] = await Promise.all([
    readProjectFile(".github/workflows/daily-climate-data.yml"),
    readProjectFile("package.json"),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(packageJson.scripts["data:update"], /npm run data:verify/);
  assert.match(workflow, /run: npm run data:update/);
  assert.doesNotMatch(workflow, /run: npm run data:verify/);
  assert.match(workflow, /git status --porcelain -- public\/data src\/data\/bundled-enso\.ts/);
  assert.match(workflow, /git add -A public\/data src\/data\/bundled-enso\.ts/);
});

test("Pages deploys main pushes and successful updater completions", async () => {
  const workflow = await readProjectFile(".github/workflows/deploy-pages.yml");

  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /workflow_run:\s*\n\s+workflows:\s*\n\s+- Daily Climate Data Update\s*\n\s+types:\s*\n\s+- completed\s*\n\s+branches:\s*\n\s+- main/,
  );
  assert.match(
    workflow,
    /if: github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'/,
  );
});

test("Pages refreshes the Hungarian energy snapshot often without ever blocking the climate deploy", async () => {
  const [workflow, packageJsonText] = await Promise.all([
    readProjectFile(".github/workflows/deploy-pages.yml"),
    readProjectFile("package.json"),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(packageJson.scripts["data:energy"], /scripts\/update-energy-data\.mjs/);
  assert.doesNotMatch(packageJson.scripts["data:update"], /data:energy/);
  assert.match(workflow, /schedule:\s*\n\s+- cron: "1-59\/5 \* \* \* \*"/);
  assert.match(
    workflow,
    /- name: Refresh Hungarian energy snapshot\s*\n\s+continue-on-error: true\s*\n\s+timeout-minutes: \d+[\s\S]*?run: npm run data:energy\s*\n\s*\n\s+- name: Build app/,
  );
});
