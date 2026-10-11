# Install on your GitHub profile

1. Open lepotatoguy/lepotatoguy.
2. Replace README.md with the packaged README.md.
3. Upload assets and .github, preserving their paths. GitHub's picker may hide .github; drag the folder into the upload page or copy it through Git.
4. Commit these files together.
5. Add the private language token described below, then run telemetry from the Actions tab once.

The daily workflow refreshes telemetry, contribution charts, language cards and research focus at 06:17 UTC. It must be installed on the repository's default branch. GitHub may delay scheduled runs. Its built-in GITHUB_TOKEN writes the generated SVGs as github-actions[bot]. Repository policy must allow contents: write.

Upload README.md, SOURCE.md, SETUP.md, assets and .github. preview.html, preview.png, research and graphify-out are local work files.

## Private repository languages

The packaged language cards include public and private owned, non-forked repositories accessible through Joy's existing local GitHub authentication. Future daily runs need their own secret:

1. Create a fine-grained personal access token under GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens.
2. Choose lepotatoguy as resource owner. Select the private repositories to include, or all repositories. Metadata: read-only is sufficient for the REST language endpoints used by this collector. No write or source-content permissions are needed.
3. In lepotatoguy/lepotatoguy, open Settings > Secrets and variables > Actions > New repository secret.
4. Name it LANGUAGE_STATS_TOKEN and paste the token there. Do not put it in the README, image URL or chat.
5. Run telemetry once. Replace the secret when the token expires.

The collector paginates all accessible owned repositories, excludes forks, sums GitHub's language byte counts and renders the six largest languages using GitHub Stats Extended's original compact renderer. Percentages are normalized over those six displayed languages. They describe repository code volume, regardless of who authored it, rather than time spent programming. Archived repositories are included. Private repository names, URLs and source code are not published.

Without LANGUAGE_STATS_TOKEN, daily runs preserve the packaged private-language cards and log a warning. Failed fetches stop the workflow before committing, preserving the previously published cards. The language token is separate from the built-in token used for telemetry and commits.

Sources: [GitHub language API permissions](https://docs.github.com/en/rest/repos/repos#list-repository-languages), [original card renderer](https://github.com/stats-organization/github-stats-extended/tree/master/packages/core).

## Automated research footer

The footer reads research/STATE.md from the default branch of each accessible owned repository. It chooses the repository with the latest default-branch commit and a recognized stage. The ledger is read at that exact commit. Private repositories display @ private; public repositories display their name. Commit messages are not published. Forks, archived repositories and the profile repository are excluded.

One-time setup:

1. Create a separate fine-grained token, with Contents: read-only for the research repositories you want included. Metadata read is added automatically. No write permission is required.
2. Add it to profile repository Actions secrets as RESEARCH_STATUS_TOKEN.
3. Optionally add RESEARCH_STATUS_REPOS as another secret containing comma-separated owner/repository pairs. This limits the scan, supports repositories you collaborate on, and avoids putting private repository names in public configuration. When omitted, all accessible owned repositories are checked.
4. Run telemetry once. Future runs refresh daily. Replace the token secret when it expires.

The reader accepts explicit stage, current_stage, pipeline_stage or phase fields, including Markdown bullets and bold formatting. Recognized values: lit-review, gap-analysis, experiment-design, experiment-explore, experiment-run, writeup and revision. The research workflow maintains those fields; the footer does not edit or advance your pipeline.

A done/completed state uses completed wording; paused or blocked states use generic labels. Unknown or ambiguous stages are skipped. Only fixed stage phrases, commit dates and public repository names are published. Private repositories use @ private. Private repository names, paper titles, findings, commit messages and state-file text are never written to the profile or logs.

Without RESEARCH_STATUS_TOKEN, daily runs preserve the packaged footer and its original check date. With a configured token but no recognized pushed state, the footer says Workflow state unavailable. A failed API request stops the refresh before assets are written, preserving the published footer. The last source-update date remains visible, so old stages are not presented as newly updated work. The date of the last bot check remains.

Local verification used Joy's existing GitHub authentication. Actions requires the secrets above. Reading private ledgers requires broader access than the Metadata-only language collector; keep these secrets separate.

Sources: [GitHub content API](https://docs.github.com/en/rest/repos/contents#get-repository-content), [GitHub commit API](https://docs.github.com/en/rest/commits/commits#list-commits).

## Profile content

The package adapts Sakif16's original README, SVG panels and telemetry generator, with GitHub blue accents and personalized content. The streak flame retains the source red and orange colors. Research is section 03; telemetry is section 04.

The system map retains five confirmed lowercase areas. Hidden scores determine its polygon. Edit areas in .github/profile.json to change the map. The Python class uses portfolio skills; domains summarize the selected papers. Research entries link to eight selected publications, with verified published titles and journal issue years.

## Push-triggered footer refresh

The profile workflow accepts footer_only=true through workflow_dispatch. This refreshes only the footer. Daily telemetry remains enabled as a fallback.

Install .github/templates/research-profile-push.yml as .github/workflows/research-profile-push.yml in each watched research repository. Add PROFILE_REFRESH_TOKEN to each watched repository's encrypted Actions secrets. Use a separate fine-grained token restricted to lepotatoguy/lepotatoguy with Actions: write and required Metadata: read. It cannot read private research code. The existing read-only tokens remain separate.

The relay sends no repository names, commit messages or file contents. GitHub queues a footer refresh after each push; startup and image cache delays mean the visible badge is not instantaneous. Commits must reach GitHub; local commits cannot trigger a hosted workflow. New repositories need the relay installed too.

Source: [GitHub workflow dispatch permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
