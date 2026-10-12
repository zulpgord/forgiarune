#!/bin/zsh
# Rigenera la voce di Alfie nel tutorial (Guida), in italiano e in inglese,
# e la incorpora in index.html dentro <script id="kwAudio">.
# I testi stanno in <script id="kwSay">; qui si corregge solo la pronuncia
# dei termini stranieri (solo per l'audio: il testo a schermo non cambia).
# Voci neurali maschili Kokoro, in locale e senza chiavi:
#   italiano im_nicola, inglese am_michael.
# Requisiti:
#   - brew install espeak-ng
#   - un Python >= 3.10 con kokoro-onnx, phonemizer-fork e soundfile,
#     indicato con KW_PY=/percorso/python
#   - i file del modello (kokoro-v1.0.onnx e voices-v1.0.bin, dalle release
#     di github.com/thewh1teagle/kokoro-onnx) nella cartella KW_KOKORO
# Uso: KW_PY=… KW_KOKORO=… tools/kw-audio.sh
set -e
cd "$(dirname "$0")/.."
: "${KW_PY:?indica il Python con kokoro-onnx in KW_PY}"
: "${KW_KOKORO:?indica la cartella del modello Kokoro in KW_KOKORO}"
ESPEAK="$(brew --prefix espeak-ng)"
TMP=$(mktemp -d)
"$KW_PY" - "$TMP" "$KW_KOKORO" "$ESPEAK" <<'EOF'
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro, EspeakConfig
out, mod, esp = sys.argv[1:4]
s = open("index.html").read()
a = s.index('<script id="kwSay" type="application/json">'); a = s.index(">", a) + 1
say = json.loads(s[a:s.index("</script>", a)])
k = Kokoro(f"{mod}/kokoro-v1.0.onnx", f"{mod}/voices-v1.0.bin",
           espeak_config=EspeakConfig(lib_path=f"{esp}/lib/libespeak-ng.dylib", data_path=f"{esp}/share/espeak-ng-data"))
VOCE = {"it": ("im_nicola", "it", 1.0), "en": ("am_michael", "en-us", .96)}
# pronuncia: sostituzioni applicate solo al parlato
PRON = {
  "en": {"EasyFabio": "Easy Fabio", "takt": "tact", "Yamazumi": "Yamazoomy"},
  "it": {"Solo Leveling": "Solo Lèvelin", "Alfie": "Alfi", "EasyFabio": "Isi Fabio", "forecast": "forcast", "Google Drive": "Gugol Draiv",
         "PowerPoint": "Pauer Point", "browser": "brauser", "Gantt": "Gant", "slide": "slaid"},
}
for lang, texts in say.items():
    os.makedirs(f"{out}/{lang}")
    voce, codice, vel = VOCE[lang]
    for i, t in enumerate(texts):
        for a, b in PRON[lang].items():
            t = re.sub(rf"\b{re.escape(a)}\b", b, t)
        audio, sr = k.create(t, voice=voce, speed=vel, lang=codice)
        sf.write(f"{out}/{lang}/{i:02d}.wav", audio, sr)
    print(lang, len(texts), "scene,", voce)
EOF
for L in it en; do
  for f in "$TMP/$L"/*.wav; do afconvert -f m4af -d aac -b 32000 -c 1 "$f" "${f%.wav}.m4a"; done
done
python3 - "$TMP" <<'EOF'
import base64, glob, json, sys
au = {L: ["data:audio/mp4;base64," + base64.b64encode(open(f, "rb").read()).decode()
          for f in sorted(glob.glob(f"{sys.argv[1]}/{L}/*.m4a"))] for L in ("it", "en")}
p = "index.html"; s = open(p).read()
a = s.index('<script id="kwAudio">'); b = s.index("</script>", a) + 9
s = s[:a] + '<script id="kwAudio">/* voce del tutorial: generata da tools/kw-audio.sh */ const KW_AUDIO = ' + json.dumps(au) + ";</script>" + s[b:]
open(p, "w").write(s)
print("audio incorporato:", len(json.dumps(au)) // 1024, "KB")
EOF
rm -rf "$TMP"
