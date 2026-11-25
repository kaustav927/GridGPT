# Weekly maintenance agent

Instructions for the scheduled Claude Code agent that keeps GridGPT healthy without the owner
having to come back to it. The schedule's prompt only says "follow docs/maintenance-agent.md",
so edit this file to change what the agent does.

## Ground rules

- **Never push to `main`.** All changes go on one branch, `maintenance/YYYY-MM-DD`, with one pull
  request per run. The owner reviews the Vercel preview and merges.
- **No change is a fine outcome.** If every check passes and nothing needs updating, don't open a PR.
  Say so in the run summary.
- **Never invent facts.** Model IDs, electricity rates and schedules must come from the sources
  listed below. If a source can't be read or doesn't confirm a value, open an issue instead of
  guessing.
- **Backend problems are not fixable here.** The data pipeline (Kafka producer and ClickHouse) runs
  on a Hetzner VPS outside this repo. Report those as GitHub issues; don't change code to hide them.
- Before opening an issue, check that an open issue with the same title doesn't already exist.
  If one does, add a comment with the new findings instead.
- Keep the PR small and explain every change in its description.

## 1. Health check

Request `https://www.gridgpt.ca/api/health`.

- `status: "ok"` means nothing to do.
- A table in `data` with `ok: false` means the pipeline is stale. Open or update an issue titled
  **"Data pipeline: stale tables"** listing each table, its `latest` timestamp and `ageMinutes`.
- `basemap.ok: false` means the keyless Esri Dark Gray tiles used by the map aren't loading. Open or
  update an issue titled **"Map: Esri basemap tiles failing"** with `basemap.status`. If Esri has
  started requiring a key (as CARTO did before), say so and suggest self-hosting a Protomaps
  `.pmtiles` extract of Ontario as the option with no vendor dependency.

Then fetch `https://www.gridgpt.ca/sitemap.xml` and request every URL in it. Each must return 200.
For each page, also check whether its HTML contains "temporarily unavailable"; if so, list it in the
pipeline issue. A failing page caused by frontend code is something to fix in the PR.

## 2. Chat model

The Grid AI model default lives in `frontend/src/lib/chat/model.ts` (`CHAT_MODEL`). Production can
override it with the `ANTHROPIC_MODEL` env var; `/api/health` reports the model actually in use.

- Look up the current models at https://docs.claude.com/en/docs/about-claude/models/overview.
- If a **newer Sonnet-tier** model exists than the default, update the default ID. Stay in the
  Sonnet tier: this is a public chat with a daily quota, so don't move to a more expensive tier.
- If the update needs SDK changes, bump `@anthropic-ai/sdk` in `frontend/` and fix any type errors
  in `frontend/src/app/api/chat/route.ts`.
- If `/api/health` reports a different model than the default, mention it in the PR: someone set
  `ANTHROPIC_MODEL` in Vercel, and that override wins until it's removed.

## 3. Dependencies

In `frontend/`:

- Run `npm outdated`. Apply **patch and minor** updates. After each group of updates, the
  verification in section 5 must pass; revert any update that breaks it and note why in the PR.
- **Major** updates (Next.js, React, Blueprint, Leaflet, Recharts and so on): don't apply them.
  List them in an issue titled **"Major dependency updates available"**, updated each week.
- Run `npm audit --omit=dev` and list high or critical advisories in the PR description.

## 4. Household electricity rates (Ontario Energy Board)

Rates live in `frontend/src/data/oeb-rates.ts`; period and holiday logic in `frontend/src/lib/rpp.ts`.

- Check the newest "effective" row at
  https://www.oeb.ca/consumer-information-and-protection/electricity-rates/historical-electricity-rates
  for the Time-of-Use, Ultra-Low Overnight and Tiered tables.
- If it's newer than `RPP_RATES.effectiveFrom`, update the prices and `effectiveFrom`.
- Confirm the hour schedule from a text source, such as https://www.torontohydro.com/for-home/rates.
  Don't rely on images or memory.
- `touPeriodAt` in `rpp.ts` currently implements the **winter** Time-of-Use hours (Nov 1 to Apr 30).
  Before May 1, add the summer schedule, keyed by date, once its hours are confirmed from a text
  source. Then set `validUntil` to the last day of the new season.
- The household widgets hide themselves after `validUntil`. If that date is within 21 days and the
  next season's rates or hours can't be confirmed yet, open or update an issue titled
  **"Household rates expire soon"** so the owner knows the bar is about to disappear.
- Holidays are computed by rule. Compare `ontarioRppHolidays(year)` with the OEB holiday page
  (https://www.oeb.ca/consumer-information-and-protection/electricity-rates/holiday-schedule-time-use-and-ultra-low)
  for the current year. Fix the rule if they differ.

## 5. Verify before opening the PR

From `frontend/`, all of these must pass:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

There's no database in this environment, so the server-rendered pages build in their "temporarily
unavailable" state. That's expected.

## 6. Pull request

- Title: `Weekly maintenance YYYY-MM-DD: <short summary>`
- Body: a section per area (health, model, dependencies, rates) with what changed and why, links
  to the sources used, the verification commands and their results, and links to any issues
  opened or updated.
