# Shared brief — rebuilding the Y Figma file as Claude Design artboards

Goal: recreate each Figma screen AS CLOSE AS POSSIBLE (same layout, sizes, French text, colors) as a `.dc.html` artboard.
You only WRITE files (Write tool). Do NOT publish, do NOT call the Artifact tool, do NOT render/screenshot your own artboards.

## Sources (read first)
- `design/content-notes.md` — full transcription of every screen (text, states, sizes, frame coordinates). Copy text EXACTLY (accents, spaces before ? and !, typos included like "charactères", "crée").
- Visual reference: the Figma SVG exports in `y/archive/figma-export/y-design/` (text is outlined). Render a region to PNG and look at it with Read:
  `y/design/crop.sh "<svg path>" <x> <y> <w> <h> <scale> <out.png>` (svg coordinates; frame origins are in content-notes.md). Write PNGs to your own scratch folder. Keep renders few (each costs tokens): ~1–3 per artboard.
- Component API: `design-system/ds-build/project/components/bundle.js` (namespace `YDS`).

## Output location
`design/canvas-build/project/<File>.dc.html` — only the files assigned to you. canvas.json is already written: do not touch it.
Root size of each artboard = its board size (fixed px width × height): see your assignment.

## Artboard skeleton (copy exactly; lang="fr")
```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Connexion — Desktop</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/yds/components/bundle.css">
<script src="ds/yds/components/bundle.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
<style>
body{margin:0}
a{color:#6366f1}a:hover{color:#4338ca}
</style>
</helmet>
<div style="width: 1440px; height: 950px; box-sizing: border-box; background: #f8fafc; color: #1e293b; font-family: Inter, system-ui, sans-serif; ...">
  ... markup ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":950}}'>
class Component extends DCLogic {
renderVals() {
return { yes: true };
}
}
</script>
</body>
</html>
```
Rules that fail silently if broken:
- Keep `<script src="./support.js"></script>` exactly. Close every non-void element, quote every attribute. In attribute values `&` must be `&amp;`.
- Layout with flex/grid + gap, inline `style="…"`. `<helmet><style>` only for body/a basics.
- `{{hole}}` = dotted lookup into `renderVals()` only, never expressions. Copy text = literal markup (not props).
- No script-built UI, no `window.X` of your own, no emoji, no iframes. Icons: `YDS.Icon` (see names below) else inline stroke SVG.
- Real `<button>`, `<a href>`, `<input>` + `<label>`. `aria-label` on icon-only buttons.
- Data-props JSON in single quotes. Static mockups: no tweaks needed (only `$preview`).
- Use literal hex colors from the token table in inline styles (not var()).

## Mount the real components (x-import)
`<x-import component-from-global-scope="YDS.Button" variant="primary" size="md">Découvrir Y</x-import>`
Attributes = props (camelCase written kebab-case). Strings literal; booleans/numbers/arrays/objects via `{{ }}` holes from renderVals (e.g. `block="{{yes}}"`, `reactions="{{postA.reactions}}"`, `tags="{{postA.tags}}"`). Element content = children. `style="…"` on x-import only places/sizes the slot.
- `YDS.Icon` name, size(24), color, strokeWidth. Names: home home-filled search bell mail bookmark user circle-ellipsis ellipsis image gif poll smile calendar-clock map-pin globe thumbs-up thumbs-down user-plus triangle-alert plus shield eye-off flag log-in arrow-left calendar message-circle repeat heart chart share badge-check x
- `YDS.YLogo` size(40), tone primary|ink|white, tile(bool: rounded indigo tile)
- `YDS.Button` variant primary|outline|secondary|ghost, size sm|md|lg, shape rounded(8px)|pill, icon (left icon name), icon-right ("y" = Y mark, or icon name), block(bool), type
- `YDS.IconButton` icon, tone primary|muted, hover(bool), label, icon-size
- `YDS.Avatar` name, initial, size(40), src
- `YDS.NavItem` icon, label, active(bool), hover(bool), badge
- `YDS.Tab` label, active(bool), hover(bool)
- `YDS.TextField` label, hint, placeholder, value, type, icon (right icon e.g. calendar), error (string), errors (array → bullet list), multiline(bool), rows, muted(bool: value shown muted), align ("center" centers the label)
- `YDS.Checkbox` label, checked
- `YDS.FollowButton` followed(bool → "Suivi !"), icon-only(bool)
- `YDS.ReactionPill` kind like|dislike|y, count, active(bool), block(bool full-width)
- `YDS.QuestionPost` author, date, tags(array), body, reactions({like,dislike,y}), followed, y-active, hide-follow, stacked(bool: mobile layout — stacked full-width pills, icon-only follow, tags stacked), compact; children render below the actions (thread box goes inside).
- `YDS.Card` raised(bool), tone ("muted" = #f8fafc fill), style; children.
If a component cannot match the Figma look exactly, build that piece as markup with inline styles instead — fidelity wins.

## Tokens (light)
background #f8fafc · foreground #1e293b · card #ffffff · primary #6366f1 · primary-foreground #ffffff · secondary #e5e7eb · secondary-foreground #374151 · muted #f3f4f6 · muted-foreground #6b7280 · accent #e0e7ff · destructive #ef4444 · border/input #d1d5db · slate-500 (landing body text) #64748b · indigo-200 (carousel dots) #c7d2fe · indigo-700 #4338ca · black #000000 (auth titles, legal links)
Radius 4/8/16/24/9999. Shadow raised `0px 4px 8px -1px rgba(0,0,0,0.1)`. Spacing 4/8/12/16/24/32/48/64.
Fonts: Inter (all UI), JetBrains Mono (doc labels), Merriweather (unused in Y).

## Assets (use these urls verbatim)
- photo-1 (left, woman smiling with laptop): `/_blob/14da1af2286527504ab7485082cc9689`
- photo-2 (center, man with phone): `/_blob/fa1e1aa44634afa7f8e1473f4ae59929`
- photo-3 (right, woman at laptop): `/_blob/a67cd9f6a30e9f68037d27598e73bc8a`
- Y logo: prefer `<x-import component-from-global-scope="YDS.YLogo" size="90"></x-import>` (inline, colorable).

## When done
Reply with: files written, anything you could not match, and assumptions. Keep the reply short.
