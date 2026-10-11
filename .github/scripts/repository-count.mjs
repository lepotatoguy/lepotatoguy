// Return aggregate counts only. Private repository identifiers stay in memory.
export async function collectRepositoryCount({ user, token = process.env.RESEARCH_STATUS_TOKEN, fetchImpl = fetch }) {
  if (!token) return null;
  const owner = user.toLowerCase();
  async function gh(path, allowEmpty = false) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': user },
    });
    if (allowEmpty && response.status === 409) {
      const error = await response.json();
      if (error.message === 'Git Repository is empty.') return [];
    }
    if (!response.ok) throw new Error(`Repository count request failed: HTTP ${response.status}`);
    return response.json();
  }
  async function pages(path) {
    const rows = [];
    for (let page = 1; ; page++) {
      const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, true);
      if (!Array.isArray(batch)) throw new Error('Expected repository count list');
      rows.push(...batch);
      if (batch.length < 100) return rows;
    }
  }
  const viewer = await gh('/user');
  if (viewer.login.toLowerCase() !== owner) throw new Error('Repository count token must belong to profile owner');
  const repos = [...new Map((await pages('/user/repos?affiliation=owner'))
    .filter((repo) => repo.owner.login.toLowerCase() === owner)
    .map((repo) => [repo.id, repo])).values()];
  const originals = repos.filter((repo) => !repo.fork).length;
  let workedForks = 0;
  const forks = repos.filter((repo) => repo.fork);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, forks.length) }, async () => {
    while (next < forks.length) {
      const repo = forks[next++];
      if (!repo.default_branch || !Number.isFinite(Date.parse(repo.created_at))) continue;
      // An untouched fork can retain its upstream push date, preceding creation.
      if (Number.isFinite(Date.parse(repo.pushed_at)) && Date.parse(repo.pushed_at) < Date.parse(repo.created_at)) continue;
      let cursor = null;
      let worked = false;
      do {
        const response = await fetchImpl('https://api.github.com/graphql', {
          method: 'POST', signal: AbortSignal.timeout(30000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': user },
          body: JSON.stringify({
            query: `query($owner:String!,$name:String!,$author:ID!,$since:GitTimestamp!,$cursor:String){
              repository(owner:$owner,name:$name){refs(refPrefix:"refs/heads/",first:100,after:$cursor){
                nodes{target{... on Commit{history(first:1,author:{id:$author},since:$since){
                  nodes{committedDate author{user{id}}}
                }}}} pageInfo{hasNextPage endCursor}
              }}
            }`,
            variables: { owner: user, name: repo.name, author: viewer.node_id, since: repo.created_at, cursor },
          }),
        });
        if (!response.ok) throw new Error(`Fork history request failed: HTTP ${response.status}`);
        const result = await response.json();
        if (result.errors?.length || !result.data?.repository?.refs)
          throw new Error('Fork history query failed; previous telemetry preserved');
        const refs = result.data.repository.refs;
        worked = refs.nodes.some((ref) => ref.target?.history?.nodes?.some((commit) =>
          commit.author?.user?.id === viewer.node_id && Date.parse(commit.committedDate) >= Date.parse(repo.created_at)));
        if (worked || !refs.pageInfo.hasNextPage) break;
        if (!refs.pageInfo.endCursor || refs.pageInfo.endCursor === cursor) throw new Error('Invalid fork branch pagination');
        cursor = refs.pageInfo.endCursor;
      } while (true);
      if (worked) workedForks++;
    }
  }));
  return { total: originals + workedForks, originals, workedForks };
}
