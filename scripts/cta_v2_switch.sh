#!/usr/bin/env bash
# Swap the hero call to action from v1 (scroll to the contact emails) to v2 (link to app.magivision.io).
# Idempotent: exits 0 without changes when v2 is already in place. Run from the repo root.
# Scheduled by .github/workflows/cta-v2-20261110.yml for 2026-11-10 01:00 America/Toronto (06:00 UTC).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'EOF'
import re, sys
p = "index.html"
s = open(p, encoding="utf-8").read()
start = s.find('<div class="try-cta" id="try-cta">')
if start < 0:
    sys.exit("try-cta block not found")
end = s.find("</div>", start) + len("</div>")
block = s[start:end]
if "app.magivision.io" in block:
    print("already v2"); sys.exit(0)
v2 = '''<div class="try-cta" id="try-cta">
        <span class="try-cta-kicker">// coaches &amp; content creators</span>
        <a class="try-cta-btn" href="https://app.magivision.io" rel="noopener">
          <span class="try-cta-text">UPLOAD A ROUND. GET YOUR CLIPS.</span>
          <span class="try-cta-arrow" aria-hidden="true">&rarr;</span>
        </a>
        <span class="try-cta-note">free while we're in early access &middot; sign in with your email, no password</span>
      </div>'''
open(p, "w", encoding="utf-8").write(s[:start] + v2 + s[end:])
print("switched to v2")
EOF
