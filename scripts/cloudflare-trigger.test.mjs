import assert from "node:assert/strict";
import { test } from "node:test";
import triggerWorker, { dispatchDeploy } from "../cloudflare/deploy-trigger/index.js";

const env = { GITHUB_TOKEN: "test-token", GITHUB_REPOSITORY: "owner/repo", GITHUB_WORKFLOW: "deploy-pages.yml", GITHUB_REF: "main" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Cloudflare cron dispatches the Pages workflow when no run is active", async () => {
  const requests = [];
  const fetcher = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/runs?")) return json({ total_count: 0, workflow_runs: [] });
    return new Response(null, { status: 204 });
  };

  const result = await dispatchDeploy(env, { fetcher });

  assert.equal(result.status, "dispatched");
  const dispatch = requests.at(-1);
  assert.equal(dispatch.url, "https://api.github.com/repos/owner/repo/actions/workflows/deploy-pages.yml/dispatches");
  assert.equal(dispatch.options.method, "POST");
  assert.equal(dispatch.options.headers.authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(dispatch.options.body), { ref: "main" });
});

test("Cloudflare cron skips the dispatch while a run is queued or deploying", async () => {
  let dispatched = false;
  const fetcher = async (url) => {
    if (String(url).includes("status=in_progress")) return json({ total_count: 1 });
    if (String(url).includes("/runs?")) return json({ total_count: 0 });
    dispatched = true;
    return new Response(null, { status: 204 });
  };

  const result = await dispatchDeploy(env, { fetcher });

  assert.equal(result.status, "skipped");
  assert.equal(dispatched, false);
});

test("Cloudflare cron reports a rejected dispatch", async () => {
  const fetcher = async (url) => (String(url).includes("/runs?") ? json({ total_count: 0 }) : new Response("Bad credentials", { status: 401 }));
  await assert.rejects(dispatchDeploy(env, { fetcher }), /Workflow dispatch failed: HTTP 401/);
});

test("Cloudflare cron fails closed without its token", async () => {
  await assert.rejects(dispatchDeploy({}), /GITHUB_TOKEN is required/);
});

test("the Cloudflare Worker exposes no public trigger route", async () => {
  const response = await triggerWorker.fetch(new Request("https://trigger.example.test/"));
  assert.equal(response.status, 404);
});
