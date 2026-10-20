# M3 plan — Conversations

Status: **accepted by the owner (2026-10-20). All six questions are answered (see below). Nothing is committed yet.** Product references: `docs/y-product-and-web-documentation.md` (milestone table, rules R2, R3, R6, R12–R14, section 3.2 flows, section 9.2 endpoints, section 12.5 and 12.7 screen states, section 13 erasure) and `docs/decisions/journal-decisions.md` (DEC-158 to DEC-172 for M2).

Scope (from the milestone table): 50 Y opens the conversation; replies; reply reactions; "Voir plus de réponses"; mentions. Notification events are **written** in M3 and **shown** in M5.

Exit criteria (from the milestone table): replies refused below 50 Y; cursor pagination verified; the events for 50 Y and mentions are stored.

## What already exists (checked 2026-10-20)

- Database: tables `replies`, `reply_reactions`, `mentions`, `notifications`; columns `questions.reply_count` and `questions.conversation_opened_at`; migrations `replies_body_length` and the erasure placeholders are applied.
- The threshold is read from configuration (`Y_CONVERSATION_THRESHOLD`, default 50). The question payload already carries `yThreshold`, `conversationOpen` and `replyCount`.
- At 50 Y, `conversationOpenedAt` is set in the reactions service. No notification is written there yet.
- No replies module, no reply routes, no conversation UI in the frontend.

## Rules this plan applies

- R2: reply reactions are `like` and `dislike` only. They are independent: one user can hold both (DBML note on `reply_reactions`, decided 2026-10-16). Removing one kind is allowed.
- R3: replies are accepted only once the conversation is open (50 Y). The threshold is never hard-coded.
- R6: inline expansion. "Voir plus de réponses" loads more replies on the same page. No new page.
- R13: only `active` accounts can reply, react or mention.
- R14: no reply or mention between two accounts that block each other. Replies and messages follow the rule already applied to question reactions (DEC-165).
- Section 3.2: once open, the conversation stays open even if the Y count drops.
- Replies: 280 characters (D3). Own replies can be deleted (soft delete).
- Reply count is kept in the same transaction as the reply (like question reactions in M2).
- Hashtag-only sorting: no thematic categories (memory rule).

## Backend

| # | Task | Done when |
|---|---|---|
| B1 | Check `replies`, `reply_reactions`, `mentions` and `notifications` against DBML v0.9 and the migrations. Add a migration only if a gap is found | Schema review note updated; no unplanned migration |
| B2 | At the 50 Y crossing, write one `conversation_opened` notification to the question's author (only on the first crossing) | Test: the event is written once, even with more Y after 50 |
| B3 | `POST /questions/{id}/replies`: 1 to 280 characters, active author (R13), no block (R14), `Idempotency-Key`, refused with 422 below 50 Y, `reply_count` updated in the same transaction | e2e: 49 Y refused, 50 Y accepted, 281 characters refused, blocked pair refused, repeated key returns the first reply |
| B4 | `GET /questions/{id}/replies?cursor=…&limit=…`: visible replies only, cursor pagination, default 20, maximum 50 | e2e: pages do not repeat or skip; hidden and deleted replies excluded |
| B5 | `DELETE /replies/{id}`: soft delete of one's own reply; `reply_count` decremented in the same transaction | e2e: count matches the rows; another user's reply is refused |
| B6 | `PUT` and `DELETE /replies/{id}/reactions/{kind}` (`like`, `dislike`): idempotent, counters in the same transaction, block rule applied | e2e: like and dislike independent, removal of one kind keeps the other, counters match the rows |
| B7 | Counters correct under concurrent replies and reactions | Integration test with parallel requests: counters equal the number of rows |
| B8 | Mentions: extract `@handle` from replies and from questions (POST `/questions`, same parser); store one `mentions` row per mentioned user; a mention of an account that blocks or is blocked by the author refuses the whole post (answered 2026-10-20); plain text only, no suggestion list | Unit tests: duplicates, unknown handles, own handle; e2e: a question with a mention stores one row |
| B9 | Mention notifications and `reply_to_question` notifications are written (not shown; shown in M5) | Test: one event per mention and per reply, none for the author's own actions |
| B10 | `openapi.yaml` regenerated, `npm run openapi:check` passes; `Location` header on the reply POST, 204 on the reaction DELETE, as in M2 | Check passes |

## Frontend

| # | Task | Done when |
|---|---|---|
| F1 | Reply count on each question card; the conversation opens inline under the card (R6) | Vitest; e2e on three viewports |
| F2 | Below 50 Y: the area shows « Les réponses s'ouvrent à 50 Y » with the current count, no empty list (section 12.5) | Vitest; e2e: text and count match the card |
| F3 | Reply composer with the 280-character counter (CharCounter, DEC-106), visible only when open | Unit tests; refusal above 280 |
| F4 | Replies list with « Voir plus de réponses » (cursor, inline) | e2e: second page loads inline |
| F5 | Reply reactions J'aime and Pas d'accord with counts, each toggled on its own | Unit tests; e2e: each kind added and removed separately |
| F6 | Delete one's own reply | e2e: removed from the list and the count |
| F7 | Mentions in the text are shown as links to the profile route once it exists; until then as plain text | Vitest |
| F8 | Layout and features the same on desktop, tablet and mobile (no feature removed; collapse into menus if needed) | Captures compared with the conversation boards of the design page; every action reachable on each size |
| F9 | Accessibility: axe on the conversation, keyboard use of reactions and the composer | No violation (WCAG 2.2 AA) |
| F10 | Information button next to the Y counter, opening a short dialog that explains the 50 Y rule (section 12.5) | Vitest; axe on the dialog; works on all three sizes (dialog on desktop and tablet, bottom sheet on mobile, as for reports) |
| F11 | Share view `/questions/[id]`: one question and its conversation, reachable from a shared link and from « Copier le lien », not linked from navigation (R6, D4) | e2e: the page opens from the copied link; 404 for hidden or deleted questions |

## Documentation

| # | Task | Done when |
|---|---|---|
| X1 | Journal entries for each decision taken for M3 | One entry per owner decision, numbered after DEC-172 |
| X2 | Product doc: section 9.2 (reply endpoints), milestone table, version bump | Updated with the code |
| X3 | This plan updated after each step | Progress table filled in |

## Questions for the owner (asked one form at a time, starting with the plan validation)

1. **Mention of a blocked account:** answered 2026-10-20: the whole reply is refused (R14).
2. **Deleted reply:** answered 2026-10-20: removed from the list, and the count goes down.
3. **Share view `/questions/[id]`:** answered 2026-10-20: built in M3, with the copy-link action.
4. **Mentions in questions:** answered 2026-10-20: added now to POST `/questions`, with the same parser as replies (B8).
5. **Explanation of the 50 Y rule:** answered 2026-10-20: in M3, information button and dialog (F10).
6. **Autocomplete on `@`:** answered 2026-10-20: plain text in M3, `@pseudo` recognised without a suggestion list.

## Progression (2026-10-20)

State of each task, as committed on origin/main (`d8c2efa`).

| Task | State | Commit or note |
|---|---|---|
| B1 | Done | Schema checked against DBML v0.9 |
| B2 | Done | `0d27f20` (notice once at 50 Y, not to the author's own Y: DEC-195) |
| B3 to B7, B10 | Done | Lot A: `8497d2b`, `0825b0f`, `23d3499`, `36a41c7`; reply DELETE answers 404 to a non-author (DEC-190) |
| B8, B9 | Done | `7a37086`, `fe4ab84` (one notification when the question author is mentioned, DEC-189) |
| B4 (GET replies) | Done | Lot A |
| Question detail (for F11) | Done | `5677547` (`GET /questions/{id}`, not in the original list: needed by the share view) |
| F1 | Done | Card shows the reply count (`ad8acd0`) |
| F2 | Done | Closed line below 50 Y (`Conversation`) |
| F3 | Done in code, tested by unit tests | Composer with the 280 counter; no end-to-end test yet (no route shows the composer for writing outside the share view, which is read-only) |
| F4 | Done | "Voir plus de réponses", oldest first (DEC-198) |
| F5 | Done | Pressed state per reaction, each toggled on its own (`reply-item.tsx`) |
| F6 | Done | ⋯ menu, confirmation dialog, own replies only |
| F7 | Done as plain text | No link until the profile route exists (as planned) |
| F8 | Done for the states drawn on the design page (section 16) | Rendering in the application checked by the owner; design page v103 for tablet and mobile |
| F9 | Partly | Focus and keyboard use in the components; no axe run yet on the conversation |
| F10 | Done | Dialog on desktop and tablet; bottom sheet on mobile by CSS class (no sheet component in the repo) |
| F11 | Done | Share view `/questions/[id]`, read-only (owner decision), not in navigation |
| X1 | Done for lot B and the review | DEC-186 to DEC-198 |
| X2 | Done | Section 9.2, route `GET /questions/{id}` |
| X3 | Done | This section |

Open points: the end-to-end test of the composer (F3); the axe check of the conversation (F9); the check of the rendering in the application by the owner.

## Working method (decided 2026-10-20, DEC-182 to DEC-184)

- Four lots, built one after the other: A (backend replies: B3 to B7, B10), B (mentions and notifications: B8, B9), C (frontend conversation: F1 to F11), D (documentation: X1 to X3).
- After each step, the checks for the files it touches (targeted tests, then lint and tsc). The full suites run once per lot.
- One owner validation per lot: a short diff summary and the commit message. Nothing is committed or pushed before that.
- Sequential: backend first, then frontend, in the same repository.
- M0 steps 9 to 12 and 15, the Brevo domain and the legal texts are postponed (DEC-184).
- At the end of M3, the owner reviews the code. A review guide lists the commits, the files of each lot and the tests that cover them.

## Progress

| Step | Status | Commit |
|---|---|---|
| Plan drafted and accepted (2026-10-20) | Done | — |
| B1 schema check against DBML v0.9 and migrations | Done: no gap, no migration needed. The DBML note on independent reply reactions is the source for R2 | — |
| B2 `conversation_opened` notice to the author, once, at the 50 Y crossing | Done in the working tree: unit tests (12 in `reactions`), e2e `reactions` 11/11, tsc and lint clean. Not committed, message waiting for the owner's validation | — |
| Lot A, shared Idempotency-Key handling (`common/idempotency`), questions moved onto it, fingerprint per route (DEC-185) | Done in the working tree: questions unit 19/19, questions e2e green | — |
| Lot A, B3: `POST /questions/{id}/replies` (422 below 50 Y, 280 characters, blocked pair 404, key replay, Location) | Done in the working tree: replies e2e green | — |
| Lot A, B4 to B5: list oldest first with cursor, soft delete by the author (403 for others, 404 once deleted) | Done in the working tree: e2e green | — |
| Lot A, B6 to B7: reply reactions, like and dislike independent, counters under parallel calls | Done in the working tree: e2e green (parallel test 30 s timeout) | — |
| Lot A, B10: OpenAPI regenerated, `openapi:check` OK | Done in the working tree | — |
| Lot A checks | Backend unit 183/183. Backend e2e 145/145 with `--maxWorkers=2`; with the default workers, timeouts of 5 s appear on the existing tests too (load, not the code) | — |
