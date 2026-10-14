import { privateTaskLabel, summarizeCommit } from './commit-summary.mjs';

export function formatCentralTime(value, includeTime = true) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  }).formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return `${date}${includeTime ? ` ${parts.hour}:${parts.minute}` : ''} ${parts.timeZoneName}`;
}

// Private repositories may publish an allowlisted ledger stage; nothing else from them.
const STAGES = {
  'lit-review': ['Exploring research literature', 'Reviewed research literature'],
  'gap-analysis': ['Identifying research gaps', 'Identified research gaps'],
  'experiment-design': ['Designing experiments', 'Designed experiments'],
  'experiment-explore': ['Exploring experimental approaches', 'Explored experimental approaches'],
  'experiment-run': ['Running experiments', 'Completed an experiment stage'],
  writeup: ['Writing a research paper', 'Completed a paper draft'],
  revision: ['Revising a research paper', 'Completed a paper revision'],
};
export function parseResearchState(text) {
  // Read explicit fields only; never infer stages from findings or next actions.
  const fields = text.split(/\r?\n/).map((line) => line.replace(/`|\*\*|__/g, '').trim())
    .map((line) => line.replace(/^[-+*]\s+/, ''));
  const stageLines = fields.filter((line) => /^(?:(?:current|pipeline)[ _-])?(?:stage|phase)\s*[:=]/i.test(line));
  if (!stageLines.length) return null;
  // The first explicit current stage wins. Ambiguous multi-stage values are skipped.
  const current = stageLines.find((line) => /^current[ _-]/i.test(line)) || stageLines[0];
  const value = current.replace(/^[^:=]+[:=]\s*/, '').toLowerCase();
  const tokens = value.match(/\b(?:lit-review|gap-analysis|experiment-design|experiment-explore|experiment-run|writeup|revision)\b/g) || [];
  const keys = [...new Set(tokens)];
  if (keys.length !== 1) return null;
  const stage = keys[0];
  const status = fields.find((line) => /^(?:(?:current|stage)[ _-])?status\s*[:=]/i.test(line)) || '';
  const disposition = `${value} ${status.replace(/^[^:=]+[:=]\s*/, '')}`;
  if (/\bpaused\b/i.test(disposition)) return { message: 'Research workflow paused' };
  if (/\bblocked\b/i.test(disposition)) return { message: 'Research workflow awaiting input' };
  const complete = /\b(?:done|complete|completed|finished)\b/i.test(disposition);
  return { message: STAGES[stage][complete ? 1 : 0] };
}


const CONCURRENCY = 4;
const PAGE_SIZE = 100;
const MAX_COMPARE_PAGES = 3;
const MAX_STATE_BYTES = 100000;

function createClient({ user, token, fetchImpl }) {
  return async function gh(path, { allowMissing = false, allowEmpty = false, allowForbidden = false } = {}) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': user },
    });
    if (allowMissing && response.status === 404) return null;
    if (allowForbidden && response.status === 403) return null;
    if (allowEmpty && response.status === 409) {
      const error = await response.json();
      if (error.message === 'Git Repository is empty.') return null;
    }
    // Private names, file contents and response bodies must never enter logs.
    if (!response.ok) throw new Error(`Research state request failed: HTTP ${response.status}`);
    return response.json();
  };
}

// Emails only match commits GitHub could not link to the login. Held in memory only.
async function ownerIdentity(gh, viewer) {
  const listed = await gh('/user/emails', { allowMissing: true, allowForbidden: true }) || [];
  const emails = [viewer.email, `${viewer.id}+${viewer.login}@users.noreply.github.com`,
    `${viewer.login}@users.noreply.github.com`, ...(Array.isArray(listed) ? listed.map((entry) => entry.email) : [])];
  return { login: viewer.login.toLowerCase(), emails: new Set(emails.filter(Boolean).map((email) => email.toLowerCase())) };
}

const isMerge = (commit) => (commit.parents?.length || 0) > 1;
const isBot = (commit) => commit.author?.type === 'Bot' || /\[bot\]/i.test(commit.author?.login || '')
  || /\[bot\]@/i.test(commit.commit?.author?.email || '');
const commitDate = (commit) => commit.commit?.committer?.date || commit.commit?.author?.date;

export function isOwnCommit(commit, identity) {
  if (isMerge(commit) || isBot(commit)) return false;
  const login = commit.author?.login;
  if (login) return login.toLowerCase() === identity.login;
  return identity.emails.has((commit.commit?.author?.email || '').toLowerCase());
}

// Works for newest-first lists and oldest-first compare results alike.
export function newestOwnCommit(commits, identity) {
  return (Array.isArray(commits) ? commits : [])
    .filter((commit) => isOwnCommit(commit, identity) && Number.isFinite(Date.parse(commitDate(commit))))
    .reduce((best, commit) => (!best || Date.parse(commitDate(commit)) > Date.parse(commitDate(best)) ? commit : best), null);
}

// Commits on the fork's default branch that the parent lacks, newest pages first.
async function compareWithParent(gh, repo, parent) {
  const base = `/repos/${parent.full_name}/compare/${encodeURIComponent(parent.default_branch)}...`
    + `${encodeURIComponent(repo.owner.login)}:${encodeURIComponent(repo.default_branch)}?per_page=${PAGE_SIZE}`;
  const first = await gh(base, { allowMissing: true });
  if (!first) return null;
  if (!(first.ahead_by > 0)) return [];
  const pages = Math.max(1, Math.ceil((first.total_commits || 0) / PAGE_SIZE));
  const wanted = Array.from({ length: Math.min(pages, MAX_COMPARE_PAGES) }, (_, i) => pages - i);
  const results = await Promise.all(wanted.map((page) => (page === 1 ? first : gh(`${base}&page=${page}`, { allowMissing: true }))));
  return results.flatMap((result) => result?.commits || []);
}

// A fork qualifies only through own commits its parent lacks. Without a reachable
// parent, fall back to own commits made after the fork was created.
async function forkCommits(gh, repo) {
  const detail = await gh(`/repos/${repo.full_name}`, { allowMissing: true });
  const parent = detail?.parent;
  if (parent?.full_name && parent.default_branch) {
    const ahead = await compareWithParent(gh, repo, parent);
    if (ahead) return ahead;
  }
  if (!Number.isFinite(Date.parse(repo.created_at))) return [];
  return await gh(`/repos/${repo.full_name}/commits?sha=${encodeURIComponent(repo.default_branch)}`
    + `&since=${encodeURIComponent(repo.created_at)}&per_page=${PAGE_SIZE}`, { allowMissing: true, allowEmpty: true }) || [];
}

export async function latestOwnCommit(gh, repo, identity) {
  const commits = repo.fork ? await forkCommits(gh, repo)
    : await gh(`/repos/${repo.full_name}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=${PAGE_SIZE}`,
      { allowMissing: true, allowEmpty: true });
  const commit = newestOwnCommit(commits, identity);
  return commit ? { repo, commit, updated: commitDate(commit) } : null;
}

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

async function ownedRepos(gh) {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/user/repos?affiliation=owner&per_page=${PAGE_SIZE}&page=${page}`);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
  }
}

async function listedRepos(gh, repositories) {
  const names = repositories.split(',').map((name) => name.trim());
  if (names.some((name) => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))) throw new Error('Invalid RESEARCH_STATUS_REPOS format');
  return Promise.all(names.map((name) => gh(`/repos/${name}`)));
}

// An untouched fork can keep its upstream push date, which precedes creation.
const untouchedFork = (repo) => repo.fork && Number.isFinite(Date.parse(repo.pushed_at))
  && Date.parse(repo.pushed_at) < Date.parse(repo.created_at);

// Private repositories publish a ledger stage or the commit type, never message text.
async function privateTask(gh, repo, commit, statePath) {
  const file = await gh(`/repos/${repo.full_name}/contents/${statePath}?ref=${encodeURIComponent(repo.default_branch)}`, { allowMissing: true });
  const usable = file && file.type === 'file' && file.encoding === 'base64' && file.size <= MAX_STATE_BYTES;
  const stage = usable ? parseResearchState(Buffer.from(file.content, 'base64').toString('utf8')) : null;
  return stage?.message || privateTaskLabel(commit.commit?.message);
}

export async function collectResearchStatus({ user, token = process.env.RESEARCH_STATUS_TOKEN,
  repositories = process.env.RESEARCH_STATUS_REPOS || '', statePath = 'research/STATE.md', fetchImpl = fetch }) {
  const unavailable = { title: 'Recent task', message: 'Workflow state unavailable', detail: 'No recent own commit found' };
  if (!token) return { ...unavailable, detail: 'Research state connection not configured' };
  const gh = createClient({ user, token, fetchImpl });
  const viewer = await gh('/user');
  const listed = repositories.trim();
  if (!listed && viewer.login.toLowerCase() !== user.toLowerCase()) throw new Error('Research status token must belong to the profile owner');
  const identity = await ownerIdentity(gh, viewer);
  const repos = listed ? await listedRepos(gh, repositories) : await ownedRepos(gh);
  const selected = repos.filter((repo) => !repo.archived && repo.default_branch && !untouchedFork(repo)
    && repo.full_name.toLowerCase() !== `${user}/${user}`.toLowerCase());
  const candidates = (await mapLimited(selected, CONCURRENCY, (repo) => latestOwnCommit(gh, repo, identity))).filter(Boolean);
  if (!candidates.length) return unavailable;
  const latest = candidates.reduce((best, item) => (Date.parse(item.updated) > Date.parse(best.updated) ? item : best));
  const { repo, commit, updated } = latest;
  const message = repo.private ? await privateTask(gh, repo, commit, statePath) : summarizeCommit(commit.commit?.message);
  const context = repo.private ? 'private' : repo.name || repo.full_name.split('/')[1];
  return { title: 'Recent task', message, context, detail: `Latest commit ${formatCentralTime(updated)}` };
}
