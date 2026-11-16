/**
 * Cloudflare Worker that starts the "Deploy GitHub Pages" workflow every five
 * minutes, so the Energy system page gets a fresh MAVIR snapshot on time.
 * GitHub's own schedule for frequent cron jobs is best effort and can skip
 * hours; a workflow_dispatch from here starts within seconds.
 *
 * The climate data is untouched: the dispatched run is the same workflow a
 * push runs, and its energy step can never block the climate deployment.
 *
 * Secret (set with `wrangler secret put GITHUB_TOKEN`): a fine-grained GitHub
 * token limited to this repository with "Actions: Read and write" permission.
 */

const DEFAULT_REPOSITORY = "tothur/Climate-Dashboard";
const DEFAULT_WORKFLOW = "deploy-pages.yml";
const DEFAULT_REF = "main";
const API_ROOT = "https://api.github.com";

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "climate-dashboard-deploy-trigger",
    "x-github-api-version": "2022-11-28",
  };
}

async function activeRunCount(fetcher, base, headers) {
  let total = 0;
  for (const status of ["queued", "in_progress"]) {
    const response = await fetcher(`${base}/runs?status=${status}&per_page=1`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Listing ${status} runs failed: HTTP ${response.status}`);
    const body = await response.json();
    total += Number(body.total_count) || 0;
  }
  return total;
}

export async function dispatchDeploy(env, options = {}) {
  const fetcher = options.fetcher ?? fetch;
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required");
  const repository = env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflow = env.GITHUB_WORKFLOW || DEFAULT_WORKFLOW;
  const ref = env.GITHUB_REF || DEFAULT_REF;
  const base = `${API_ROOT}/repos/${repository}/actions/workflows/${workflow}`;
  const headers = githubHeaders(env.GITHUB_TOKEN);

  // A run that is already queued or deploying will publish fresh data; a new
  // dispatch would only cancel it (the workflow's concurrency group).
  const active = await activeRunCount(fetcher, base, headers);
  if (active > 0) return { status: "skipped", reason: "run_active", active };

  const response = await fetcher(`${base}/dispatches`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ ref }),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 204 && response.status !== 200) {
    throw new Error(`Workflow dispatch failed: HTTP ${response.status} · ${(await response.text()).slice(0, 200)}`);
  }
  return { status: "dispatched", repository, workflow, ref };
}

export default {
  // No public route: the trigger only runs on its cron schedule.
  async fetch() {
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatchDeploy(env).then((result) => console.log(JSON.stringify(result))));
  },
};
