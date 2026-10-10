#!/bin/zsh
# Rigenera la voce del tutorial kawaii (Guida) e la incorpora in index.html.
# Legge i testi "say:" delle scene, li registra con la voce di macOS e li
# salva come AAC mono a 32 kbps dentro <script id="kwAudio">.
# Uso: tools/kw-audio.sh ["Nome voce"]   (predefinita: Samantha)
# Per una pronuncia migliore installa una voce Premium (es. Ava o Zoe) in
# Impostazioni di Sistema > Accessibilità > Contenuto letto ad alta voce.
set -e
cd "$(dirname "$0")/.."
VOICE="${1:-Samantha}"
TMP=$(mktemp -d)
python3 - "$TMP" <<'EOF'
import re, sys, json
s = open("index.html").read()
start = s.index("const SCENES = [")
texts = re.findall(r'\n      say: "((?:[^"\\]|\\.)*)"', s[start:s.index("const AUDIO =", start)])
for i, t in enumerate(texts):
    open(f"{sys.argv[1]}/{i:02d}.txt", "w").write(json.loads(f'"{t}"'))
print(len(texts), "scene")
EOF
for f in "$TMP"/*.txt; do
  say -v "$VOICE" -r 172 -o "${f%.txt}.aiff" -f "$f"
  afconvert -f m4af -d aac -b 32000 -c 1 "${f%.txt}.aiff" "${f%.txt}.m4a"
done
python3 - "$TMP" <<'EOF'
import base64, glob, sys
files = sorted(glob.glob(f"{sys.argv[1]}/*.m4a"))
uris = ['"data:audio/mp4;base64,' + base64.b64encode(open(f, "rb").read()).decode() + '"' for f in files]
p = "index.html"; s = open(p).read()
a = s.index('<script id="kwAudio">'); b = s.index("</script>", a) + 9
s = s[:a] + '<script id="kwAudio">/* voce del tutorial: generata da tools/kw-audio.sh */ const KW_AUDIO = [' + ",".join(uris) + "];</script>" + s[b:]
open(p, "w").write(s)
print("audio incorporato:", sum(len(u) for u in uris) // 1024, "KB")
EOF
rm -rf "$TMP"
