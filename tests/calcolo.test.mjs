/* Test del calcolo di Solo Leveling.
   Carica lo script di index.html in una sandbox con un DOM finto e controlla i numeri
   di compute() su un caso semplice fatto a mano. Si lancia con: node tests/calcolo.test.mjs */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");

/* un elemento finto che accetta qualsiasi proprietà o chiamata */
const finto = () => new Proxy(function () {}, {
  get: (_, k) => k === Symbol.toPrimitive ? () => "" : k === Symbol.iterator ? function* () {} : k === "then" ? undefined : finto(),
  set: () => true,
  apply: () => finto()
});
const memoria = new Map();
const ctx = {
  console, setTimeout: () => 0, clearTimeout: () => {}, Promise, Date, Math, JSON, Intl, URL, Blob: function () {},
  localStorage: { getItem: k => memoria.has(k) ? memoria.get(k) : null, setItem: (k, v) => memoria.set(k, String(v)) },
  document: finto(), navigator: { language: "it-IT" }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {}, requestAnimationFrame: () => 0, indexedDB: undefined
};
ctx.window = ctx;
vm.createContext(ctx);
try { vm.runInContext(js, ctx); } catch (e) { /* il disegno dell'interfaccia può fallire col DOM finto: il calcolo no */ }

const run = code => vm.runInContext(code, ctx);
let ok = 0;
const test = (nome, fn) => { try { fn(); ok++; console.log("  ✓ " + nome); } catch (e) { console.log("  ✗ " + nome + "\n    " + e.message); process.exitCode = 1; } };
const vicino = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || "") + " atteso " + b + ", ottenuto " + a);

/* Caso: una fase, un reparto con 2 celle, 1 operatore, 1 turno, 1000 h lorde, efficienza 80%,
   target 80%. Una famiglia da 600 pezzi a 120 minuti, nessuno scarto, nessun setup.
   Carico = 600 × 120 / 60 = 1200 h. Capacità cella = 1000 × 1 × 0,8 × 1 = 800 h.
   Capacità di casa = 1600 h. Saturazione = 75%. Celle al target = 1200 / 800 / 0,8 = 1,875 → 2. */
function caso(extra) {
  run(`
    S = blankState();
    S.params = Object.assign(S.params, { oreAnnuePerCella: 1000, efficienza: 80, turni: 1, targetSaturazione: 80, giorniMese: null });
    S.fasi = [{ id: "f1", nome: "Montaggio" }];
    S.reparti = normalizzaReparti([{ id: "r1", nome: "Montaggio", faseId: "f1", celleAttuali: 2, celleMax: 5, celleEsterne: 0, operatori: 1, lotto: 0, macchine: 0, ltGiorni: 1 }]);
    S.famiglie = [{ id: "a", nome: "A", forecastAnni: [600, 600, 600], scarto: 0, valore: 0, mensile: uniform(), tempi: { f1: { on: true, min: 120, minMacchina: 0, setup: 0 } } }];
    ${extra || ""}
  `);
  return run("compute().righe[0]");
}

console.log("Calcolo");
test("carico, capacità e saturazione", () => {
  const r = caso();
  vicino(r.caricoH, 1200, "carico");
  vicino(r.capCella, 800, "capacità cella");
  vicino(r.capInterna, 1600, "capacità di casa");
  vicino(r.satCasa, 0.75, "saturazione");
});
test("celle al target arrotondate per eccesso", () => {
  const r = caso();
  vicino(r.suggFraz, 1.875); assert.equal(r.sugg, 2);
});
test("persone = celle × operatori × turni", () => {
  const r = caso("S.reparti[0].anni[0].operatori = 2; S.params.turni = 2;");
  vicino(r.persone, 2 * 2 * 2);
});
test("lo scarto aumenta i pezzi da lavorare", () => {
  const r = caso("S.famiglie[0].scarto = 20;");
  vicino(r.caricoH, 600 / 0.8 * 2);
});
test("celle esterne: va fuori solo il carico oltre il target", () => {
  /* soglia = 1600 × 0,8 = 1280; carico 1800 → 520 h fuori, entro 1 cella esterna da 800 h */
  const r = caso("S.famiglie[0].forecastAnni[0] = 900; S.reparti[0].anni[0].celleEsterne = 1;");
  vicino(r.caricoH, 1800); vicino(r.oreFuori, 520);
});
test("senza calendario la capacità del mese è un dodicesimo", () => {
  const r = caso();
  vicino(r.qPicco, 1 / 12);
});
test("con il calendario un agosto corto diventa il mese di picco", () => {
  /* carico uniforme, agosto con 5 giorni su 225: è il mese con meno capacità per lo stesso carico */
  const r = caso("S.params.giorniMese = [21,20,22,20,21,21,22,5,21,22,20,10];");
  assert.equal(r.picIdx, 7);
  vicino(r.qPicco, 5 / 225);
  assert.ok(r.satPiccoCasa > 1, "agosto deve risultare scoperto");
});
test("la capacità mensile somma alla capacità annua anche col calendario", () => {
  caso("S.params.giorniMese = [21,20,22,20,21,21,22,5,21,22,20,10];");
  const cap = run("capMensile(cfgRep(S.reparti[0], 0), 800, 2)");
  vicino(cap.reduce((a, b) => a + b, 0), 1600);
});
test("persone fuori cella entrano nell'organico del report", () => {
  caso("S.extra = [{ id: 'x', ruolo: 'Capo', cat: 'manager', n: [1, 1, 1] }, { id: 'y', ruolo: 'Jolly', cat: 'operatore', n: [2, 2, 2] }];");
  const a = run("datiReport()[0]");
  vicino(a.personeCelle, 2); vicino(a.extraMan, 1); vicino(a.extraOp, 2); vicino(a.persone, 5);
});

console.log("Disegno (senza errori, con un DOM finto)");
["renderRisultati", "renderReport", "renderControlli", "renderCalendario", "renderBackup", "renderRodaggio", "renderOreMese", "renderMensileEst"].forEach(fn => {
  test(fn, () => {
    caso("S.params.giorniMese = [21,20,22,20,21,21,22,5,21,22,20,10]; S.extra = [{ id: 'x', ruolo: 'Capo', cat: 'manager', n: [1, 1, 1] }];");
    run(fn + "()");
  });
});

console.log(ok + " test superati" + (process.exitCode ? ", qualcuno fallito" : ""));
