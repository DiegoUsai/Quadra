// Descrizioni in parole di una anomalia, condivise da pagina e notifiche.
export type AnomaliaDescrivibile = {
  regola: string; entitaTipo: string; entitaChiave: string; foglio: string | null;
  periodoAnno: number | null; periodoMese: number | null; valoriJson: unknown;
};
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Dove si trova l'anomalia, in parole: contratto o progetto, e mese se c'è.
export function dove(a: AnomaliaDescrivibile): { principale: string; dettaglio: string } {
  const v = (a.valoriJson ?? {}) as Record<string, unknown>;
  const mese = a.periodoMese ? `${MESI[a.periodoMese - 1]} ${a.periodoAnno}` : a.periodoAnno ? String(a.periodoAnno) : "";
  if (a.entitaTipo === "movimento") return { principale: String(v.contratto ?? a.entitaChiave.split("|")[1] ?? a.entitaChiave), dettaglio: ["riga di Costi/Ricavi", mese].filter(Boolean).join(" · ") };
  if (v.contratto && a.regola[0] !== "D") return { principale: String(v.contratto), dettaglio: [a.foglio === "Costi/Ricavi" ? "righe di Costi/Ricavi" : "", mese].filter(Boolean).join(" · ") };
  if (a.regola === "H02" || a.regola === "H03" || a.regola === "H07") return { principale: String(v.valore ?? a.entitaChiave.split("|").pop()), dettaglio: a.regola === "H07" ? "foglio Lookup" : "" };
  if (a.entitaChiave.includes("|")) { const [p, anno] = a.entitaChiave.split("|"); return { principale: `Progetto ${p}`, dettaglio: anno }; }
  if (a.regola.startsWith("D0") && a.regola !== "D05") return { principale: `Progetto ${a.entitaChiave}`, dettaglio: mese };
  return { principale: a.entitaChiave.replace(/#\d+$/, ""), dettaglio: mese };
}

// Scostamento in percentuale, senza importi: i messaggi esterni riportano id e scostamenti, non importi (specifiche 10.3).
export function scostamento(a: Pick<AnomaliaDescrivibile, "regola" | "valoriJson">): string {
  const v = (a.valoriJson ?? {}) as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" ? x : null);
  if ((a.regola === "C01" || a.regola === "C06") && n(v.importo) !== null && n(v.tipico)) {
    const p = Math.round(((v.importo as number) / (v.tipico as number) - 1) * 100);
    return `${p > 0 ? "+" : ""}${p}% sul canone tipico`;
  }
  if (a.regola === "D01" && n(v.rapporto) !== null) return `consuntivo al ${Math.round((v.rapporto as number) * 100)}% del budget`;
  return "";
}
