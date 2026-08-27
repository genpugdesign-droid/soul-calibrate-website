#!/usr/bin/env bash
# sync_app.sh — pull a magi HUD build into the site's demo embed.
#
# The demo section is an iframe over app/, which is a COPY of a preview build.
# Copying by hand means re-applying the same site adaptations every time and
# hoping none were missed; this does it in one step and then proves the copy
# still runs.
#
#   ./sync_app.sh              # newest hud_v* in the preview repo
#   ./sync_app.sh hud_v18      # a specific build
#   ./sync_app.sh --no-check   # skip the smoke test
#
set -euo pipefail

SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREVIEW="${MAGI_PREVIEW:-$HOME/Documents/soulcalibrate/docs/design_preview}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${MAGI_PORT:-8756}"
CHECK=1
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --no-check) CHECK=0 ;;
    hud_v*)     VERSION="$arg" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -d "$PREVIEW" ] || { echo "preview repo not found: $PREVIEW" >&2; exit 1; }

if [ -z "$VERSION" ]; then
  VERSION="$(ls -d "$PREVIEW"/hud_v[0-9]* 2>/dev/null \
    | sed 's|.*/||' | sort -t v -k2 -n | tail -1)"
fi
SRC="$PREVIEW/$VERSION"
[ -f "$SRC/index.html" ] || { echo "no build at $SRC" >&2; exit 1; }

echo "syncing $VERSION → app/"
rm -rf "$SITE/app"
mkdir -p "$SITE/app"
rsync -a --exclude '_*.html' --exclude '.DS_Store' "$SRC"/ "$SITE/app"/

python3 - "$SITE" "$VERSION" <<'PY'
import re, sys, os
site, version = sys.argv[1], sys.argv[2]
p = os.path.join(site, 'app', 'index.html')
s = open(p).read()
notes = []

def need(cond, msg):
    if not cond:
        print(f'  ADAPTATION FAILED: {msg}', file=sys.stderr)
        print('  the build changed shape — fix sync_app.sh before shipping this embed',
              file=sys.stderr)
        sys.exit(1)

# 1. the site owns its own footage, and unlike the session clips it decodes
before = s
s = re.sub(r'src="\.\./\.\./\.\./sessions/[^"]+"', 'src="../assets/video/throw_asset_no_bg.mp4"', s)
need(s != before, 'no session-clip src found to repoint')
notes.append(f'feed + review → site clip ({len(re.findall(r"throw_asset_no_bg", s))} refs)')

# a poster from another session would mismatch that clip
s = re.sub(r'\s*poster="poster\.jpg"', '', s)

# 2. the harness is a preview affordance, not product
m = re.search(r'<!-- Preview harness.*?<div class="harness">.*?</div>\s*', s, re.S)
if m:
    s = s[:m.start()] + '<!-- preview harness removed by sync_app.sh -->\n' + s[m.end():]
    notes.append('harness removed')
else:
    need('class="harness"' not in s, 'harness present but not in the expected shape')
    notes.append('harness already absent')

# 3. embedded, the iframe IS the stage
if 'sync_app.sh embed' not in s:
    need('<link rel="stylesheet" href="app.css">' in s, 'app.css link not found')
    s = s.replace('<link rel="stylesheet" href="app.css">',
'''<link rel="stylesheet" href="app.css">
<style>
  /* sync_app.sh embed — the iframe is the stage, so the frame fills it. */
  html, body { overflow: hidden; }
  .stage { padding: 10px; }
  .app-frame { --avail-w: calc(100vw - 20px); --avail-h: calc(100vh - 20px); }
</style>''')
    notes.append('embed css added')

s = re.sub(r'<title>[^<]*</title>', '<title>magi — dashboard + system</title>', s)
open(p, 'w').write(s)

# 4. anything the harness wired must be guarded, or removing it kills the engine
hud = open(os.path.join(site, 'app', 'hud.js')).read()
for btn in ('btnRec', 'btnScene'):
    if re.search(r"\$\('%s'\)\.addEventListener" % btn, hud):
        print(f'  WARNING: hud.js wires {btn} unguarded — with the harness removed '
              f'this throws on load and the engine never starts.', file=sys.stderr)
        print(f'  guard it in {version}/hud.js, then re-run.', file=sys.stderr)
        sys.exit(1)

for n in notes:
    print(f'  {n}')
PY

if [ "$CHECK" = "1" ] && [ -x "$CHROME" ]; then
  if curl -sf -o /dev/null "http://localhost:$PORT/app/index.html"; then
    echo "smoke test on :$PORT"
    probe="$SITE/app/_smoke.html"
    python3 - "$SITE" > "$probe" <<'PY'
import sys, os
s = open(os.path.join(sys.argv[1], 'app', 'index.html')).read()
print(s.replace('</body>', '''<script>
window.__e=[];window.addEventListener('error',function(e){window.__e.push(e.message)});
window.addEventListener('load',function(){setTimeout(function(){
  var ok = !!window.MAGI, fps = document.getElementById('vFps');
  document.title = 'SMOKE engine=' + (ok ? 'live' : 'DEAD')
    + ' fps=' + (fps ? fps.textContent : '-')
    + ' tabs=' + document.querySelectorAll('.app-tab').length
    + ' harness=' + document.querySelectorAll('.harness').length
    + ' err=' + (window.__e.length ? window.__e.join(';') : 'none');
},2200);});</script></body>'''))
PY
    out="$("$CHROME" --headless=new --disable-gpu --autoplay-policy=no-user-gesture-required \
        --window-size=1440,900 --virtual-time-budget=9000 --dump-dom \
        "http://localhost:$PORT/app/_smoke.html" 2>/dev/null | grep -o '<title>[^<]*' | sed 's/<title>//')"
    rm -f "$probe"
    echo "  $out"
    case "$out" in
      *"engine=live"*err=none*) echo "  ok" ;;
      *) echo "  SMOKE TEST FAILED — the embed will render but not run" >&2; exit 1 ;;
    esac
  else
    echo "  (site server not on :$PORT — skipping smoke test)"
  fi
fi

echo "done. app/ is $VERSION"
