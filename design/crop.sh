#!/bin/bash
# usage: crop.sh <svg> <x> <y> <w> <h> <scale> <out.png>
S=/tmp/claude-1000/-home-marthcrow-Documents-dev-perso-2027-portfolio/117005a4-4834-4278-b216-163d2ba356fb/scratchpad/previews
T=$(mktemp --suffix=.html -p $S); f=$(realpath "$1"); x=$2; y=$3; w=$4; h=$5; sc=$6; out=$7
W=$(head -c 300 "$f" | grep -o 'width="[0-9]*"' | head -1 | grep -o '[0-9]*')
printf '<html><body style="margin:0;overflow:hidden;background:#fff"><img src="file://%s" style="width:%spx;position:absolute;top:%spx;left:%spx"></body></html>' "$f" "$(python3 -c "print($W*$sc)")" "$(python3 -c "print(-$y*$sc)")" "$(python3 -c "print(-$x*$sc)")" > $T
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir=$S/chrome --window-size=$(python3 -c "print(int($w*$sc))"),$(python3 -c "print(int($h*$sc))") --screenshot="$out" "file://$T" >/dev/null 2>&1
echo $out
