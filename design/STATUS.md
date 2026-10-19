# Design assets — current status (2026-10-16)

This folder is the design source of the Y project. The design system it uses is shared across sites and lives in `../../design-system/`. The published versions are on claude.ai.

## Published
| Artifact | Link | Version |
|---|---|---|
| Design system | https://claude.ai/artifact/ThcELTvZVgW38ZfLSAdTHY | 11 |
| Design page (canvas) | https://claude.ai/artifact/LQFKsPuM9d73scYbUunAxi | 70 |

The design page has 110 boards: 40 original boards, plus 70 new boards for the screens added in step 5. Its layout index (`canvas.json`) places all of them.

## Sources (edit these)
- `../../design-system/ds-build/project/` — design system (shared across sites): tokens (`tokens.json`), components (`components/`), README.
- `canvas-build/project/` — design page: one `.dc.html` file per board, and `ds/yds/` (the copy of the design system that the boards load).

## Tools (used by the briefs)
- `render.sh`, `measure.sh`, `compare.sh`, `crop.sh` — render, measure and compare boards.
- `canvas_layout.py`, `gen_components.py` — layout and component generators.

## Briefs still in use
- `canvas-brief.md`, `app-responsive-brief.md`, `content-notes.md` — reference for boards and content.
- `step5-design-changes.md` — the change list applied in step 5 (tokens, AA colours, sidebar mapping, boards to create, states).

## Archived
Moved to `archive/` (see `archive/README.md`): the first pass briefs and results, the pre-pass backup, the old reference photos, and the old `next-steps.md`.

## Open items
- Design-page boards still to check visually (not rendered yet, by request).
- Y progress indicator missing on the Profile, Settings and Notifications desktop boards.
- Shared support file `support.js` is referenced by every board but is not in this folder.
- Admin boards show "—" where real counts will come from the data.
