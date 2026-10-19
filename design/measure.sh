#!/bin/bash
# usage: measure.sh <Board.dc.html> '<css selector>' ['<css selector>' ...]
# Copies the board + local DS into the harness and prints, for each selector match (max 12): x y w h (board px), font size/line/weight, color, bg, radius, padding, border, text.
S=/tmp/claude-1000/-home-marthcrow-Documents-dev-perso-2027-portfolio/e3fffaf0-2034-494d-b20f-bc0eac4967b8/scratchpad; H=$S/harness; A=/home/marthcrow/Documents/dev_perso/2027_portfolio/y/design
b=$1; shift; cp $A/canvas-build/project/$b $H/new/; cp $A/../../design-system/ds-build/project/components/bundle.{js,css} $H/new/ds/yds/components/
read w h <<< $(python3 -I -c "import json;d=json.load(open('$A/canvas-build/project/canvas.json'))['boards'].get('$b');print(d['w'],d['h'])" 2>/dev/null || echo "1440 1073")
s=$(python3 -I -c "import json,sys,urllib.parse;print(urllib.parse.quote(json.dumps(sys.argv[1:])))" "$@")
google-chrome --headless=new --disable-gpu --no-sandbox --user-data-dir=$(mktemp -d -p $S) --virtual-time-budget=9000 --window-size=$w,$h --dump-dom "http://localhost:8765/new/measure.html?b=$b&w=$w&h=$h&s=$s" 2>/dev/null | python3 -I -c "import sys,re,html;m=re.search(r'<pre id=\"out\">(.*?)</pre>',sys.stdin.read(),re.S);print(html.unescape(m.group(1)) if m else 'FAILED')"
