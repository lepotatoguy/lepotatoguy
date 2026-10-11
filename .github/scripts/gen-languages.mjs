#!/usr/bin/env node
// Aggregate owned, non-forked repositories; reuse GitHub Stats Extended's renderer.
// Private metadata stays in memory. Published SVGs contain only language totals.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const USER = "lepotatoguy";
const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const PRIVATE_TOKEN = process.env.LANGUAGE_STATS_TOKEN;
const TOKEN = PRIVATE_TOKEN || process.env.GITHUB_TOKEN;
const CARD_ROOT = process.env.LANGUAGE_CARD_ROOT;
if (!TOKEN || !CARD_ROOT) throw new Error("A GitHub token and LANGUAGE_CARD_ROOT are required");
const { renderTopLanguages } = await import(pathToFileURL(resolve(CARD_ROOT, "build/cards/top-languages.js")).href);
const { getLanguageColor } = await import(pathToFileURL(resolve(CARD_ROOT, "build/common/languageColors.js")).href);

async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": USER },
  });
  // Do not print paths or response bodies that may identify private repositories.
  if (!response.ok) throw new Error(`Language metadata request failed: HTTP ${response.status}`);
  return response.json();
}
async function pages(path) {
  const result = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`${path}&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error("Expected a repository list");
    result.push(...batch);
    if (batch.length < 100) return result;
  }
}
const publicRepos = await pages(`/users/${USER}/repos?type=owner`);
let privateRepos = [];
if (PRIVATE_TOKEN) {
  const viewer = await gh("/user");
  if (viewer.login.toLowerCase() !== USER) throw new Error("LANGUAGE_STATS_TOKEN must belong to the profile owner");
  privateRepos = await pages("/user/repos?affiliation=owner&visibility=private");
} else {
  console.warn("LANGUAGE_STATS_TOKEN missing: language card includes public repositories only");
}
const repos = [...new Map([...publicRepos.filter((r) => !r.private), ...privateRepos]
  .filter((r) => !r.fork && r.owner.login.toLowerCase() === USER)
  .map((r) => [r.id, r])).values()];
const totals = new Map();
let next = 0;
// Limit concurrency to keep requests within GitHub's secondary rate limits.
await Promise.all(Array.from({ length: Math.min(4, repos.length) }, async () => {
  while (next < repos.length) {
    const repo = repos[next++];
    const languages = await gh(`/repos/${encodeURIComponent(USER)}/${encodeURIComponent(repo.name)}/languages`);
    for (const [name, bytes] of Object.entries(languages)) {
      if (!Number.isFinite(bytes) || bytes < 0) throw new Error("Invalid language byte count");
      const current = totals.get(name) || { name, size: 0, count: 0, color: getLanguageColor(name) };
      current.size += bytes;
      current.count++;
      totals.set(name, current);
    }
  }
}));
if (!totals.size) throw new Error("No language data returned; existing cards preserved");
const data = Object.fromEntries([...totals].sort(([, a], [, b]) => b.size - a.size));
const options = { layout: "compact", langs_count: 6, card_width: 480, hide_border: true, bg_color: "00000000" };
const cards = {
  dark: renderTopLanguages(data, { ...options, title_color: "58a6ff", text_color: "e6edf3" }),
  light: renderTopLanguages(data, { ...options, title_color: "0969da", text_color: "0d1117" }),
};
const assets = resolve(ROOT, "assets");
mkdirSync(assets, { recursive: true });
for (const [theme, card] of Object.entries(cards)) writeFileSync(resolve(assets, `languages-${theme}.svg`), card);
console.log(`Language cards updated: ${repos.filter((r) => !r.private).length} public and ${repos.filter((r) => r.private).length} private owned, non-forked repositories`);
