#!/bin/zsh
# Rigenera la voce di Alfie nel tutorial (Guida), in italiano, inglese e cinese,
# e la incorpora in index.html dentro <script id="kwAudio">.
# I testi stanno in <script id="kwSay">; qui si corregge solo la pronuncia
# dei termini stranieri (solo per l'audio: il testo a schermo non cambia).
# Voci neurali maschili Kokoro, in locale e senza chiavi:
#   italiano im_nicola, inglese am_michael, cinese zm_yunxi.
# Requisiti:
#   - brew install espeak-ng
#   - un Python >= 3.10 con kokoro-onnx, phonemizer-fork, soundfile e misaki[zh]
#     (fonetica cinese con i toni, quella su cui è addestrato Kokoro),
#     indicato con KW_PY=/percorso/python
#   - i file del modello (kokoro-v1.0.onnx e voices-v1.0.bin, dalle release
#     di github.com/thewh1teagle/kokoro-onnx) nella cartella KW_KOKORO
# Uso: KW_PY=… KW_KOKORO=… tools/kw-audio.sh [lingue]   (predefinite: it en zh;
# le lingue non indicate restano quelle già incorporate)
set -e
cd "$(dirname "$0")/.."
: "${KW_PY:?indica il Python con kokoro-onnx in KW_PY}"
: "${KW_KOKORO:?indica la cartella del modello Kokoro in KW_KOKORO}"
ESPEAK="$(brew --prefix espeak-ng)"
LINGUE="${*:-it en zh}"
TMP=$(mktemp -d)
"$KW_PY" - "$TMP" "$KW_KOKORO" "$ESPEAK" $=LINGUE <<'EOF'
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro, EspeakConfig
out, mod, esp = sys.argv[1:4]; lingue = sys.argv[4:]
s = open("index.html").read()
a = s.index('<script id="kwSay" type="application/json">'); a = s.index(">", a) + 1
say = json.loads(s[a:s.index("</script>", a)])
k = Kokoro(f"{mod}/kokoro-v1.0.onnx", f"{mod}/voices-v1.0.bin",
           espeak_config=EspeakConfig(lib_path=f"{esp}/lib/libespeak-ng.dylib", data_path=f"{esp}/share/espeak-ng-data"))
VOCE = {"it": ("im_nicola", "it", 1.0), "en": ("am_michael", "en-us", .96), "zh": ("zm_yunxi", "cmn", 1.0)}
# pronuncia: sostituzioni applicate solo al parlato
PRON = {
  "en": {"EasyFabio": "Easy Fabio", "takt": "tact", "Yamazumi": "Yamazoomy"},
  "it": {"Solo Leveling": "Solo Lèvelin", "Alfie": "Alfi", "EasyFabio": "Isi Fabio", "forecast": "forcast", "Google Drive": "Gugol Draiv",
         "PowerPoint": "Pauer Point", "browser": "brauser", "Gantt": "Gant", "slide": "slaid"},
  "zh": {"Solo Leveling": "索罗 莱维林", "Alfie": "阿尔菲", "EasyFabio": "伊西 法比奥", "PowerPoint": "幻灯片", "Google Drive": "谷歌云盘"},
}
for lang in lingue:
    texts = say[lang]
    os.makedirs(f"{out}/{lang}")
    voce, codice, vel = VOCE[lang]
    for i, t in enumerate(texts):
        for a, b in PRON[lang].items():
            t = re.sub(rf"\b{re.escape(a)}\b", b, t)
        if lang == "zh":
            from misaki import zh
            g2p = g2p if "g2p" in dir() else zh.ZHG2P()
            audio, sr = k.create(g2p(t)[0], voice=voce, speed=vel, is_phonemes=True)
        else:
            audio, sr = k.create(t, voice=voce, speed=vel, lang=codice)
        sf.write(f"{out}/{lang}/{i:02d}.wav", audio, sr)
    print(lang, len(texts), "scene,", voce)
EOF
for L in ${=LINGUE}; do
  for f in "$TMP/$L"/*.wav; do afconvert -f m4af -d aac -b 32000 -c 1 "$f" "${f%.wav}.m4a"; done
done
python3 - "$TMP" $=LINGUE <<'EOF'
import base64, glob, json, sys
nuovi = {L: ["data:audio/mp4;base64," + base64.b64encode(open(f, "rb").read()).decode()
          for f in sorted(glob.glob(f"{sys.argv[1]}/{L}/*.m4a"))] for L in sys.argv[2:]}
p = "index.html"; s = open(p).read()
a = s.index('<script id="kwAudio">'); b = s.index("</script>", a) + 9
v = s.index("const KW_AUDIO = ", a) + len("const KW_AUDIO = ")
au = json.loads(s[v:s.rindex(";", v, b)]); au.update(nuovi)
s = s[:a] + '<script id="kwAudio">/* voce del tutorial: generata da tools/kw-audio.sh */ const KW_AUDIO = ' + json.dumps(au) + ";</script>" + s[b:]
open(p, "w").write(s)
print("audio incorporato:", len(json.dumps(au)) // 1024, "KB")
EOF
rm -rf "$TMP"
