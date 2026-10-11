export function formatCentralTime(value, includeTime = true) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  }).formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return `${date}${includeTime ? ` ${parts.hour}:${parts.minute}` : ''} ${parts.timeZoneName}`;
}

// Read pushed workflow ledgers; publish only allowlisted stage labels and dates.
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

export async function collectResearchStatus({ user, token = process.env.RESEARCH_STATUS_TOKEN,
  repositories = process.env.RESEARCH_STATUS_REPOS || '', statePath = 'research/STATE.md', fetchImpl = fetch }) {
  const unavailable = { title: 'Recent task', message: 'Workflow state unavailable', detail: 'No recognized pushed stage available' };
  if (!token) return { ...unavailable, detail: 'Research state connection not configured' };
  async function gh(path, allowMissing = false, allowEmpty = false) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': user },
    });
    if (allowMissing && response.status === 404) return null;
    if (allowEmpty && response.status === 409) {
      const error = await response.json();
      if (error.message === 'Git Repository is empty.') return null;
    }
    // Private names, file contents and response bodies must never enter logs.
    if (!response.ok) throw new Error(`Research state request failed: HTTP ${response.status}`);
    return response.json();
  }
  let repos;
  if (repositories.trim()) {
    const names = repositories.split(',').map((name) => name.trim());
    if (names.some((name) => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))) throw new Error('Invalid RESEARCH_STATUS_REPOS format');
    repos = await Promise.all(names.map((name) => gh(`/repos/${name}`)));
  } else {
    const viewer = await gh('/user');
    if (viewer.login.toLowerCase() !== user.toLowerCase()) throw new Error('Research status token must belong to the profile owner');
    repos = [];
    for (let page = 1; ; page++) {
      const batch = await gh(`/user/repos?affiliation=owner&per_page=100&page=${page}`);
      repos.push(...batch);
      if (batch.length < 100) break;
    }
  }
  const candidates = [];
  let next = 0;
  const selected = repos.filter((repo) => !repo.fork && !repo.archived && repo.default_branch && repo.full_name.toLowerCase() !== `${user}/${user}`.toLowerCase());
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (next < selected.length) {
      const repo = selected[next++];
      const commits = await gh(`/repos/${repo.full_name}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=1`, true, true);
      if (!commits?.length) continue;
      const commit = commits[0];
      const updated = commit.commit.committer.date;
      if (!Number.isFinite(Date.parse(updated))) continue;
      const file = await gh(`/repos/${repo.full_name}/contents/${statePath}?ref=${encodeURIComponent(commit.sha)}`, true);
      if (!file || file.type !== 'file' || file.encoding !== 'base64' || file.size > 100000) continue;
      const stage = parseResearchState(Buffer.from(file.content, 'base64').toString('utf8'));
      if (stage) candidates.push({ ...stage, updated, context: repo.private ? 'private' : repo.name || repo.full_name.split('/')[1] });
    }
  }));
  candidates.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
  if (!candidates.length) return unavailable;
  const latest = candidates[0];
  return { title: 'Recent task', message: latest.message, context: latest.context, detail: `Latest commit ${formatCentralTime(latest.updated)}` };
}
