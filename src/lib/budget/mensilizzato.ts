// Lettura della tabella "mensilizzata" del budget (una riga per linea e tipo, un importo per mese).
// Le colonne dei mesi e il totale si cercano per NOME (gennaio ... dicembre, "Totale complessivo"), mai per posizione:
// i fogli hanno versioni con e senza le colonne dei totali trimestrali (CLAUDE.md, convenzioni).
export type RigaBudget = { linea: string; tipo: string; gruppo: "Canone" | "Variabile"; mese: number; importo: number; nota: string | null };
export type EsitoLettura = { righe: RigaBudget[]; totale: number; avvisi: string[] };

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Importi in formato italiano ("€ 1.234,56", " 1.234,56 € ", "-", "") o già numerici ("1234.5").
export function numero(c: string): number | null {
  const t = c.replace(/[€\u00a0\s]/g, "").replace(/\uFFFD/g, "");
  if (t === "" || t === "-") return null;
  if (/[.,]/.test(t) === false) return Number(t);
  const v = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/(?<=\d)\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(v) ? v : null;
}

export const gruppoDi = (tipo: string): "Canone" | "Variabile" => (norm(tipo) === "canone" ? "Canone" : "Variabile"); // MEV, Licenze e righe senza tipo sono variabile

// Decodifica un file di testo: UTF-8 se valido, altrimenti Windows-1252 (l'export di Sheets/Excel su Windows).
export function decodifica(b: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); }
}

export function leggiMensilizzato(testo: string): EsitoLettura {
  const celle = testo.replace(/^\uFEFF/, "").split(/\r?\n/).map((r) => r.split("\t"));
  const avvisi: string[] = [];
  // Intestazione: la riga che contiene "gennaio" e "dicembre"
  const hi = celle.findIndex((r) => r.some((c) => norm(c) === "gennaio") && r.some((c) => norm(c) === "dicembre"));
  if (hi < 0) throw new Error("tabella mensile non trovata: manca la riga con le colonne gennaio ... dicembre");
  const h = celle[hi].map(norm);
  const col = MESI.map((m) => h.indexOf(m));
  if (col.some((i) => i < 0)) throw new Error(`mesi mancanti nell'intestazione: ${MESI.filter((_, i) => col[i] < 0).join(", ")}`);
  const cTot = h.indexOf("totale complessivo");

  const righe: RigaBudget[] = [];
  let linea: string | null = null, totaleFoglio: number | null = null, mensiliFoglio: (number | null)[] | null = null;
  for (const r of celle.slice(hi + 1)) {
    const nome = (r.slice(0, col[0] - 1).find((c) => c.trim() !== "") ?? "").trim(); // nome della linea: prima delle colonne tipo e mesi
    const tipo = (r[col[0] - 1] ?? "").trim();
    if (norm(nome) === "totale complessivo") { totaleFoglio = cTot >= 0 ? numero(r[cTot] ?? "") : null; mensiliFoglio = col.map((i) => numero(r[i] ?? "")); break; }
    if (nome) linea = nome;
    const importi = col.map((i) => numero(r[i] ?? "") ?? 0);
    if (!linea || importi.every((x) => x === 0)) continue;
    const nota = (r.slice(Math.max(cTot, col[11]) + 1).find((c) => c.trim() !== "") ?? "").trim() || null;
    importi.forEach((importo, i) => { if (importo !== 0) righe.push({ linea: linea!, tipo, gruppo: gruppoDi(tipo), mese: i + 1, importo, nota }); });
    // Controllo riga: somma dei mesi contro il totale del foglio, quando c'è
    const tot = cTot >= 0 ? numero(r[cTot] ?? "") : null;
    const somma = importi.reduce((a, b) => a + b, 0);
    if (tot !== null && Math.abs(somma - tot) > 1) avvisi.push(`${linea}${tipo ? " · " + tipo : ""}: i mesi sommano ${somma.toFixed(2)}, il foglio indica ${tot.toFixed(2)}`);
  }
  if (!righe.length) throw new Error("nessuna riga di budget letta");
  const totale = righe.reduce((a, r) => a + r.importo, 0);
  // Controllo per mese: le righe devono sommare il totale mensile che il foglio riporta nella riga "Totale complessivo"
  if (mensiliFoglio) MESI.forEach((nomeMese, i) => {
    const somma = righe.filter((x) => x.mese === i + 1).reduce((a, x) => a + x.importo, 0), foglio = mensiliFoglio![i];
    if (foglio !== null && Math.abs(somma - foglio) > 1) avvisi.push(`${nomeMese}: le righe sommano ${somma.toFixed(2)}, la riga Totale complessivo del foglio indica ${foglio.toFixed(2)}`);
  });
  if (totaleFoglio !== null && Math.abs(totale - totaleFoglio) > 1) avvisi.push(`totale letto ${totale.toFixed(2)} diverso dal totale del foglio ${totaleFoglio.toFixed(2)}`);
  return { righe, totale, avvisi };
}
