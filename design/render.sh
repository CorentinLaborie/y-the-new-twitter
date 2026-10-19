#!/bin/bash
# usage: render.sh <Board.dc.html> [W H]  → copies board from canvas-build + local DS bundle into harness/new, writes harness/newshots/<Board>.png
S=/tmp/claude-1000/-home-marthcrow-Documents-dev-perso-2027-portfolio/e3fffaf0-2034-494d-b20f-bc0eac4967b8/scratchpad; H=$S/harness; A=/home/marthcrow/Documents/dev_perso/2027_portfolio/y/design
b=$1; cp $A/canvas-build/project/$b $H/new/; cp $A/../../design-system/ds-build/project/components/bundle.{js,css} $H/new/ds/yds/components/
if [ -n "$3" ]; then w=$2; h=$3; else read w h <<< $(python3 -I -c "import json;d=json.load(open('$A/canvas-build/project/canvas.json'))['boards'].get('$b');print(d['w'],d['h'])" 2>/dev/null || echo "1440 1073"); fi
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir=$(mktemp -d -p $S) --virtual-time-budget=8000 --window-size=$w,$h --screenshot=$H/newshots/${b%.dc.html}.png http://localhost:8765/new/$b >/dev/null 2>&1
echo $H/newshots/${b%.dc.html}.png
