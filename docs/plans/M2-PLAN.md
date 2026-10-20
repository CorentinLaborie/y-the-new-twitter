# M2 plan — Questions

Status: **accepted by the owner** (2026-10-20, DEC-158). The six decisions below are taken. Product references: `docs/y-product-and-web-documentation.md` (milestone table, rules R1–R12, section 9.2 endpoints, section 13 erasure) and `docs/decisions/journal-decisions.md` (DEC-046, DEC-049, DEC-091, DEC-158 to DEC-163).

Scope (from the milestone table): post a question, the "Pour vous" feed (trending and recent, D17), question reactions, Y progress, erasure of deleted content after 90 days.

## Rules this plan applies

- R1: questions are text only, up to 280 characters.
- R2 and R11: question reactions are `like`, `dislike`, `y`; one reaction per user and question; changing replaces the previous one; removing is allowed.
- R3: replies open at 50 Y; Y progress is shown as 49/50.
- R12: a question that does not reach 50 Y stays in the feed, trends and search with no time limit.
- R13: only `active` accounts can react or post.
- DEC-049: M2 shows the single tab "Pour vous" (the "Abonnements" tab comes in M4).
- DEC-046 and DEC-091: "Pour vous" shows the most trending questions (reactions in the last 24 hours, labelled « sur 24 h ») and the most recent ones, from everyone, sorted by date, the most recent first. The 24 hours rank the trending block only (DEC-160).
- Hashtag-only sorting: no thematic categories anywhere (memory rule, owner 2026-10-15).

## Backend

| # | Task | Done when |
|---|---|---|
| B1 | Check the `questions`, `question_reactions` and counter columns against DBML v0.9 and the migrations; add a CHECK for the 280-character limit if it is missing | Migration applied on the test database; schema review note updated |
| B2 | `POST /questions`: text only, 1 to 280 characters, hashtags extracted, only `active` accounts (R13) | Unit tests; e2e: 280 accepted, 281 refused (422), suspended account refused (403) |
| B3 | `PUT` and `DELETE /questions/{id}/reactions/{kind}`: one reaction per user (R11), counters updated in the same transaction | e2e: change replaces, removal works, counters match the rows |
| B4 | Counters correct under concurrent reactions | Integration test with parallel requests: counters equal the number of rows |
| B5 | Y progress: count of `y` reactions against the threshold of 50 (R3) | Test: 49/50 and 50/50 values returned |
| B6 | `GET /feed?tab=for-you&cursor=…`: the first page (no cursor) returns a `trending` block (the 10 most reacted questions of the last 24 hours, DEC-159) and 20 `items` sorted by date, the most recent first, without the trending questions; later pages return `trending: []`; cursor pagination | Test: a question is in the feed with no time limit (R12); pages do not repeat or skip; on the first page, trending questions do not repeat in `items` (later pages may show them, DEC-171) |
| B7 | Erasure of the content of deleted accounts after 90 days (section 13), built in M2 as the milestone table says | Test with an expired row; the job is scheduled |
| B8 | `openapi.yaml` regenerated, `npm run openapi:check` passes | Check passes |

## Frontend

| # | Task | Done when |
|---|---|---|
| F1 | Home page, tab "Pour vous", feed of question cards, with the loading, empty and error states of the Home boards | Vitest and e2e (mocked API) on three viewports |
| F2 | Question composer with the 280-character counter | Unit tests; the counter and the refusal above 280 |
| F3 | Reactions (J'aime, Pas d'accord, Y) with counts, one per user; the Y progress (49/50) shown on each question card; « atteint » at the threshold (DEC-161) | Unit tests; e2e: change and removal; the progress value on each card |
| F4 | Accessibility: axe on the home page, keyboard use of the reactions | No violation (WCAG 2.2 AA, as for the auth screens) |
| F5 | Layout as the Home boards for desktop, tablet and mobile (`04 · Accueil`), no feature change between sizes (memory rule) | Screenshots compared with the boards; every action reachable on each size |
| F6 | Home states: loading, empty and error (boards `Home-Loading-*`, `Home-Empty-*`, `Home-Error-*` for desktop and mobile). Tablet states: no board on the canvas, so they are a narrower version of the desktop states (decision of 2026-10-20) | Captures compared with the desktop boards and the mobile boards; tablet captures compared with the desktop states |
| F7 | Visitor landing page on `/` (guests only), responsive: desktop from `Main.dc.html` (1440 x 2671, « 02 · Landing — Desktop »), tablet from `Landing-Tablet.dc.html` (768 x 2765), mobile from `Landing-Mobile.dc.html` (360 x 2584). Links to `/login` and `/signup`. Its feed states follow the feed of M2 | Captures compared with the three boards; no horizontal scroll at 360, 768 and 1440; axe on each size |
| F8 | Routing of `/`: a guest sees the landing page; a logged-in user is sent to `/home` (product table: `/` = guest, `/home` = user). The current M0 health page moves from `/` to `/health`; its e2e tests (home.spec, accessibility, brand) move with it | e2e: guest on `/` sees the landing; logged-in user on `/` lands on `/home`; `/health` shows the API status |
| F9 | Trending block « Tendances sur 24 h » above the date list on the first page (labelled region, hidden when empty); reactions update the same question in the block and in the list (B6, DEC-159) | Vitest (order, hidden when empty, reaction in the block); e2e on three viewports |

## Documentation

| # | Task | Done when |
|---|---|---|
| X1 | Journal entries for each decision of M2 | Done: DEC-158 to DEC-163 |
| X2 | Product doc: status of section 9.2 and the milestone table | Done: document 0.11 (section 9.1 idempotency expiry, section 9.2 feed `trending` block, changelog) |
| X3 | This plan updated after each step | Done |

## Decisions taken by the owner (2026-10-20)

1. Erasure of deleted content after 90 days is built in M2 (B7), as the milestone table says.
2. The Y progress (49/50) is shown on each question card (F3), with « atteint » at the threshold.
3. The "Pour vous" feed is sorted by date, the most recent first. The 10 most trending questions of the last 24 hours form a block above the date list (B6, DEC-159). The first version of this decision asked for one mixed list; the block replaces it.
4. The visitor landing page on `/` is built in M2, with the feed (F7, F8). It must be responsive and use the three visuals of the canvas (desktop, tablet, mobile).
5. Tablet states of the home page (F6): a narrower version of the desktop states, since the canvas has no tablet board.
6. The current M0 health page moves from `/` to `/health` (F8).

## Answers given on 2026-10-20 (form)

- Plan accepted (DEC-158).
- Trending block: 10 questions by default (DEC-159).
- The 24-hour window does not remove questions from the feed (R12, DEC-160).
- Label at the threshold: « atteint » (DEC-161).
- Commits: three, backend, frontend, documentation, with a proposed message each (DEC-163).
- Section 9.1 documents the 24-hour expiry of idempotency keys (DEC-162).
- Trending questions are excluded from the list on the first page only; an older one may come back on page 2 (DEC-171).
- The empty state has no "Explorer" button until `/explore` exists in M4 (DEC-168).

## Still open before M2 is closed

- Review of M2 done (2026-10-20). Its blockers and majors are fixed: block rule on reactions, purge write right limited to `body`, reaction date on change, shared API client, 204 and Location documented. Details in DEC-164 to DEC-170.
- Known and kept: the migration `20261020140000_idempotency_keys` has an outdated comment ("No expiry"). It is already applied, so it is not edited (DEC-056).
- Owner validation of each commit message, then the commits. Nothing is committed or pushed yet.
