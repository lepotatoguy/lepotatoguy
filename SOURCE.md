# Source
repository: https://github.com/Sakif16/Sakif16
commit: 6952e016e230f80eabc411d101bd686861e5b543
local_source: research/sakif16-source
adaptation: original README and SVG panels; GitHub blue; Joy identity; sections 01, 02, 03, 04; original activity chart; live language card
geometry: original panels adapted; header typography simplified; map axes and polygon personalized with user-supplied scores
telemetry: original generator, username/palette changed, projects omitted, pulse uses real last-28-day contributions
animation_fix: normalize generated polyline pathLength to 700 so inherited dash animation draws complete contribution curves
intro_revision: original header modified to mixed-case name and single handle; original hello.gif restored using its raw file URL
bio_source: https://lepotatoguy.github.io/ (checked 2026-10-10); efficient AI, computer vision, medical imaging, environmental sensing, trustworthy AI, bandits and online learning
status_revision: original footer layout adapted for an automated research stage; manual task setting and attribution removed
final_revision: user-provided bio wording; degree and location line removed; map labels lowercase with scores hidden; telemetry numbered 04; streak flame uses original C1121F red and original theme ember colors
research_revision: research header derived from original projects SVG; all eight portfolio-selected publications linked by DOI; titles and journal issue years verified with publisher pages and Crossref DOI metadata
metadata_differences: AQI title replaced with published title and year 2024; Involution journal year 2025; Orchestrating journal issue year 2023; original portfolio uses earlier dates
about_revision: native Python code block for Joy inserted before Outside research; skills from portfolio, no sample-person skills or certifications copied
header_revision: user-requested MS line beneath name; profile-view badge uses lepotatoguy and blueviolet
language_revision: original GitHub Stats Extended 2.2.0 compact renderer, pinned dependency; custom REST metadata collector paginates owned public and accessible private repositories, excludes forks, publishes only aggregate language data
language_source: https://github.com/stats-organization/github-stats-extended/tree/master/packages/core; npm @stats-organization/github-readme-stats-core@2.2.0 (MIT)
private_access: local generation uses existing authenticated gh access; future Actions runs need LANGUAGE_STATS_TOKEN with Metadata read for selected private repositories
latest_bio_revision: profile views first; interests removed; domains use standard research fields from selected publications; research portfolio link removed, Google Scholar retained
research_status_revision: footer shows the latest own non-merge commit across owned repositories and worked-in forks (own commits ahead of the parent); public repos publish a deterministic subject summary and name; private repos publish @ private with a ledger stage or commit-type label only
research_status_access: separate RESEARCH_STATUS_TOKEN secret with Contents read; optional RESEARCH_STATUS_REPOS secret scopes scan without exposing private repository names
missing_secrets: daily workflow preserves packaged private-language cards and research footer until their separate tokens are configured
