# Brief — App Tablet & Mobile (responsive versions of App-Desktop)

Working dir: /home/marthcrow/Documents/dev_perso/2027_portfolio. Do NOT call the Artifact tool / publish. Do NOT edit any file other than your assigned board.

## Read first
1. `design/canvas-brief.md` — artboard format rules, skeleton, YDS component API, tokens (all still apply).
2. `design/canvas-build/project/App-Desktop.dc.html` — THE source design. Reuse its markup, copy, helmet overrides, renderVals data, colors, radii, shadows. Same content: tabs "Pour vous"/"Abonnements", text-only composer "Posez votre question" (textarea "Quoi de neuf ?!", "Tout le monde peut répondre", disabled "Poster"), outline pill "+ Afficher 12 nouvelles questions", QuestionPosts AliceY / MarkL (followed, Y active, with the open thread box: "Rejoindre la conversation", "Signaler ce post", textarea "Répondre à MarkL...", AliceY reply, "+ Voir plus de réponses") / Robert44.
3. `design/canvas-build/project/App-Components.dc.html` — the component specimens (look reference).
The composer is TEXT ONLY: never add image/gif/poll/emoji/schedule/location tools.

## Render check (required, max 4 renders)
A local server serves the canvas runtime at http://localhost:8765 from `$H=/tmp/claude-1000/-home-marthcrow-Documents-dev-perso-2027-portfolio/117005a4-4834-4278-b216-163d2ba356fb/scratchpad/harness`. After writing, copy your board there and screenshot it:
```
H=/tmp/claude-1000/-home-marthcrow-Documents-dev-perso-2027-portfolio/117005a4-4834-4278-b216-163d2ba356fb/scratchpad/harness
cp design/canvas-build/project/<Board>.dc.html $H/
curl -s -o /dev/null http://localhost:8765/support.js || (cd $H && python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir=$(mktemp -d) --virtual-time-budget=10000 --window-size=<W>,<H> --screenshot=$H/shots/<board>.png http://localhost:8765/<Board>.dc.html
```
(use --force-device-scale-factor=2 for the mobile board to inspect detail). Read the PNG, fix overlaps/clipping/misalignment/text overflow, re-render. Nothing may overflow horizontally; text must not be cut mid-word; a feed clipped at the bottom edge of the screen is fine (it scrolls).

## Report (short)
File written, layout decisions, anything uncertain.
