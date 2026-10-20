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
test("persone del reparto: 4 celle e 5 persone danno la capacità di 5 persone", () => {
  /* ore 1000 × efficienza 80% = 800 h nette a persona */
  const r = caso("S.reparti[0].anni[0].celleAttuali = 4; S.reparti[0].anni[0].persone = 5;");
  vicino(r.persone, 5); vicino(r.operatori, 1.25); vicino(r.capInterna, 5 * 800);
});
test("persone del reparto vuote: una persona per cella per turno, come prima", () => {
  const r = caso("S.reparti[0].anni[0].celleAttuali = 4;");
  vicino(r.persone, 4); vicino(r.capInterna, 4 * 800);
});
test("con le persone dichiarate le ore vendibili seguono le persone", () => {
  /* carico 1200 h; 2 celle e 1 persona: capacità 800 → vendibili 800, fuori 400 */
  const r = caso("S.reparti[0].anni[0].persone = 1;");
  vicino(r.capInterna, 800); vicino(r.caricoDentro, 800); vicino(r.oreFuori, 400);
});
test("piano pluriennale: persone al target e quante aggiungerne", () => {
  /* carico 1800 h, 800 h nette a persona, target 80%: 1800 ÷ 800 ÷ 0,8 = 2,81 → 3 persone; oggi 2 → +1 */
  caso("S.famiglie[0].forecastAnni[0] = 900;");
  const x = run("datiPiano()[0].righe[0]");
  assert.equal(x.serve, 3); vicino(x.oggi, 2); vicino(x.delta, 1);
});
test("output del piano: i pezzi li limitano le ore erogate e il forecast", () => {
  /* 2 persone × 800 h = 1600 h erogate, 2 h a pezzo: si possono fare 800 pz; il forecast ne chiede 900 */
  caso("S.famiglie[0].forecastAnni[0] = 900;");
  const o = run("outputPiano()");
  vicino(o.rich, 900); vicino(o.cap, 800); vicino(o.out, 800);
});
test("output del piano: una persona assunta a gennaio aggiunge pezzi secondo il rodaggio", () => {
  /* +0,7875 persone nell'anno = +630 h = +315 pz: producibili 1115, prodotti 900 (tutto il forecast) */
  caso("S.famiglie[0].forecastAnni[0] = 900; cfgRep(S.reparti[0], 0).nuovePersone = 1; cfgRep(S.reparti[0], 0).meseIngresso = 1; cfgRep(S.reparti[0], 0).curva = [50, 75, 90, 100];");
  const o = run("outputPiano()");
  vicino(o.cap, 1115); vicino(o.out, 900);
});
test("tempi delle famiglie per anno: cambiare un anno non tocca gli altri", () => {
  /* dati vecchi: un solo «tempi» → diventa il primo anno e gli altri lo copiano */
  caso("tempiFam(S.famiglie[0], 1).f1.min = 60;");
  vicino(run("compute({ anno: 0 }).righe[0].caricoH"), 1200);
  vicino(run("compute({ anno: 1 }).righe[0].caricoH"), 600);
  vicino(run("compute({ anno: 2 }).righe[0].caricoH"), 1200);
});
test("i tempi seguono l'anno quando gli anni si riordinano", () => {
  caso("S.meta.anni = ['2027', '2026', '2028']; tempiFam(S.famiglie[0], 0).f1.min = 60;");
  run("riordinaAnni()");
  vicino(run("tempiFam(S.famiglie[0], 1).f1.min"), 60);
  vicino(run("tempiFam(S.famiglie[0], 0).f1.min"), 120);
});
test("lo scarto aumenta i pezzi da lavorare", () => {
  const r = caso("S.famiglie[0].scarto = 20;");
  vicino(r.caricoH, 600 / 0.8 * 2);
});
test("ore fuori = carico richiesto − capacità disponibile", () => {
  /* capacità disponibile 1600 h (= ore vendibili); carico 1800 → 200 h fuori, coperte dalla cella esterna */
  const r = caso("S.famiglie[0].forecastAnni[0] = 900; S.reparti[0].anni[0].celleEsterne = 1;");
  vicino(r.caricoH, 1800); vicino(r.capInterna, 1600); vicino(r.oreFuori, 200);
  vicino(r.caricoDentro, 1600); vicino(r.scoperteFuori, 0);
});
test("ore fuori senza celle esterne restano scoperte", () => {
  const r = caso("S.famiglie[0].forecastAnni[0] = 900;");
  vicino(r.oreFuori, 200); vicino(r.scoperteFuori, 200);
});
test("gli anni si riordinano in ordine crescente con i loro dati", () => {
  caso(`S.meta.anni = ["2026", "2027", "2025"]; S.meta.anno = 1;
    S.famiglie[0].forecastAnni = [100, 200, 50]; S.reparti[0].anni[2].celleAttuali = 9;`);
  assert.equal(run("riordinaAnni()"), true);
  assert.equal(run("S.meta.anni.join()"), "2025,2026,2027");
  assert.equal(run("S.famiglie[0].forecastAnni.join()"), "50,100,200");
  assert.equal(run("S.reparti[0].anni[0].celleAttuali"), 9);
  assert.equal(run("S.meta.anni[S.meta.anno]"), "2027");
});
test("nomi misti fra Anno N e anno di calendario: nessun riordino", () => {
  caso(`S.meta.anni = ["2026", "Anno 2", "Anno 3"];`);
  assert.equal(run("riordinaAnni()"), false);
});
test("un profilo di consegna tutto a zero non fa sparire il carico dai mesi", () => {
  const r = caso("S.famiglie[0].mensile = Array(12).fill(0);");
  vicino(r.meseH.reduce((a, b) => a + b, 0), r.caricoH);
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
  /* 2 persone da 800 h nette su 2 celle */
  const cap = run("capMensile(cfgRep(S.reparti[0], 0), 800, 2, 2)");
  vicino(cap.reduce((a, b) => a + b, 0), 1600);
});
test("ore erogate: agosto all'80% ridistribuito sugli altri mesi, totale invariato", () => {
  caso("S.params.erogMese = [100,100,100,100,100,100,100,80,100,100,100,100];");
  const cap = run("capMensile(cfgRep(S.reparti[0], 0), 800, 2, 2)");
  vicino(cap.reduce((a, b) => a + b, 0), 1600);
  /* agosto vale 0,8 ÷ 11,8 dell'anno, gli altri 1 ÷ 11,8 */
  vicino(cap[7], 1600 * 0.8 / 11.8); vicino(cap[0], 1600 / 11.8);
});
test("ore erogate manuali: ogni mese vale la percentuale scritta", () => {
  caso("S.params.erogMese = [100,100,100,100,100,100,100,80,100,100,100,100]; S.params.erogAuto = false;");
  const cap = run("capMensile(cfgRep(S.reparti[0], 0), 800, 2, 2)");
  vicino(cap[7], 1600 / 12 * 0.8); vicino(cap[0], 1600 / 12);
  vicino(cap.reduce((a, b) => a + b, 0), 1600 * 11.8 / 12);
});
test("piano di assunzione in persone: una persona nuova a gennaio rende secondo la curva", () => {
  /* curva 50/75/90/100 per trimestre: in un anno vale (0,5+0,75+0,9+1) × 3 ÷ 12 = 0,7875 persone */
  caso("cfgRep(S.reparti[0], 0).nuovePersone = 1; cfgRep(S.reparti[0], 0).meseIngresso = 1; cfgRep(S.reparti[0], 0).curva = [50, 75, 90, 100];");
  vicino(run("computeRodaggio().righe[0].guadagno"), 0.7875);
});
test("le celle nuove dei dati vecchi diventano persone nuove", () => {
  caso("delete S.reparti[0].anni[0].nuovePersone; S.reparti[0].anni[0].nuoveCelle = 2; S.reparti[0].anni[0].operatori = 1; S.params.turni = 2;");
  vicino(run("cfgRep(S.reparti[0], 0).nuovePersone"), 4);
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
