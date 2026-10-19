#!/bin/bash
# usage: compare.sh <Board.dc.html> [scale]  → writes harness/compare/<Board>.png : Figma (left) | Claude Design (right)
# Re-copies the board + bundle.css/js from canvas-build and design-system/ds-build before rendering. Needs harness server on :8765.
S=/tmp/claude-1000/-home-marthcrow-Documents-dev-perso-2027-portfolio/117005a4-4834-4278-b216-163d2ba356fb/scratchpad; H=$S/harness
A=/home/marthcrow/Documents/dev_perso/2027_portfolio/y/design; E=/home/marthcrow/Documents/dev_perso/2027_portfolio/y/archive/figma-export/y-design
b=$1; sc=${2:-0.6}; mkdir -p $H/compare
cp $A/canvas-build/project/$b $H/; cp $A/../../design-system/ds-build/project/components/bundle.{js,css} $H/ds/yds/components/
read svg x y w h <<< $(python3 -I -c "
m={'Logos':('00 - Logos.svg',0,0,1320,716),'Main':('01 - Landing page.svg',65,65,1440,2951),'Landing-Tablet':('01 - Landing page.svg',65,3066,768,2935),'Landing-Mobile':('01 - Landing page.svg',65,6051,360,2732),
'Auth-Login-Desktop':('02 - Auth.svg',65,65,1440,950),'Auth-Signup-Desktop':('02 - Auth.svg',1525,65,1440,900),'Auth-Signup-Errors-Desktop':('02 - Auth.svg',1525,975,1440,950),'Auth-Code-Desktop':('02 - Auth.svg',2985,65,1440,900),'Auth-Code-Error-Desktop':('02 - Auth.svg',2985,975,1440,900),
'Auth-Login-Tablet':('02 - Auth.svg',65,1975,768,1024),'Auth-Signup-Errors-Tablet':('02 - Auth.svg',853,1975,768,1024),'Auth-Code-Error-Tablet':('02 - Auth.svg',1641,1975,768,1024),
'Auth-Welcome-Mobile':('02 - Auth.svg',65,3049,360,667),'Auth-Login-Mobile':('02 - Auth.svg',435,3049,360,667),'Auth-Signup-Errors-Mobile':('02 - Auth.svg',805,3049,360,1158),'Auth-Code-Error-Mobile':('02 - Auth.svg',1175,3049,360,667),
'App-Desktop':('03 - App - Desktop.svg',65,65,1440,1073),'App-Components':('03 - App - Desktop.svg',65,1138,1440,740)}
k='$b'.replace('.dc.html','');s,x,y,w,h=m[k];print(s.replace(' ','|'),x,y,w,h)")
svg=${svg//|/ }
W=$(head -c 300 "$E/$svg" | grep -o 'width="[0-9]*"' | head -1 | grep -o '[0-9]*')
T=$(mktemp --suffix=.html -p $H)
cat > $T <<HTML
<html><body style="margin:0;background:#888;display:flex;gap:20px;align-items:flex-start">
<div style="width:${w}px;height:${h}px;overflow:hidden;position:relative;flex:none;background:#fff"><img src="figma/$svg" style="position:absolute;width:${W}px;left:-${x}px;top:-${y}px"></div>
<iframe src="$b" style="width:${w}px;height:${h}px;border:0;flex:none;background:#fff"></iframe></body></html>
HTML
mkdir -p $H/figma; [ -e "$H/figma/$svg" ] || cp "$E/$svg" "$H/figma/"
TW=$((2*w+20))
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir=$(mktemp -d -p $S) --virtual-time-budget=10000 --force-device-scale-factor=$sc --window-size=$TW,$h --screenshot=$H/compare/${b%.dc.html}.png http://localhost:8765/$(basename $T) >/dev/null 2>&1
rm -f $T; echo $H/compare/${b%.dc.html}.png
