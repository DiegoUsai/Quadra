// Persistenza delle versioni del piano (modulo di budget e review). Le versioni non si sovrascrivono mai:
// una nuova versione si crea accanto alle altre (specifiche del modulo, 4.3).
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, pianoContratto, pianoRiga, pianoVersione, rigaCorrente } from "@/db/schema";
import { etichettaVersione, type Composizione, type ContrattoScadenzario } from "./componi";

const pezzi = <T,>(x: T[], n = 400) => Array.from({ length: Math.ceil(x.length / n) }, (_, i) => x.slice(i * n, (i + 1) * n));
const testo = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const data = (v: unknown) => { const t = testo(v); return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };

// Contratti dello scadenzario all'ultima lettura (foglio Contratti Attivi).
export async function contrattiScadenzario(): Promise<ContrattoScadenzario[]> {
  const righe = await getDb().select({ dati: rigaCorrente.dati }).from(rigaCorrente).where(eq(rigaCorrente.foglio, "Contratti Attivi"));
  return righe.map((r) => r.dati as Record<string, unknown>).filter((d) => testo(d.id_contratto))
    .map((d) => ({ idContratto: String(d.id_contratto).trim(), stato: testo(d.stato), pm: testo(d.pm), inizio: data(d.data_inizio), fine: data(d.data_fine) }));
}

export async function creaVersionePiano(anno: number, numero: { maggiore: number; minore: number }, comp: Composizione, descrizione: string, fonte: string, utente: string) {
  const db = getDb();
  const [esiste] = await db.select({ id: pianoVersione.id }).from(pianoVersione)
    .where(and(eq(pianoVersione.anno, anno), eq(pianoVersione.maggiore, numero.maggiore), eq(pianoVersione.minore, numero.minore)));
  if (esiste) throw new Error(`la versione ${etichettaVersione(numero.maggiore, numero.minore)} del ${anno} esiste già: le versioni non si sovrascrivono`);
  const [v] = await db.insert(pianoVersione).values({ anno, ...numero, descrizione, fonte, creataDa: utente }).returning({ id: pianoVersione.id });
  try {
    const ids = new Map<string, number>();
    for (const g of pezzi(comp.contratti)) {
      const ins = await db.insert(pianoContratto).values(g.map((c) => ({ versioneId: v.id, ...c, probabilita: c.probabilita.toFixed(4) })))
        .returning({ id: pianoContratto.id, contratto: pianoContratto.contratto });
      for (const r of ins) ids.set(r.contratto, r.id);
    }
    const ops = pezzi(comp.righe).map((g) => db.insert(pianoRiga).values(g.map((r) => ({
      versioneId: v.id, contrattoId: ids.get(r.contratto)!, mese: r.mese, tipoVoce: r.tipoVoce, lineaServizio: r.lineaServizio,
      dettaglio: r.dettaglio, tipologia: r.tipologia, macroVoceCe: r.macroVoceCe, importo: r.importo.toFixed(2), nota: r.nota,
    }))));
    ops.push(db.insert(auditLog).values({ utente, azione: "piano.crea_versione", entita: `piano:${anno}:${etichettaVersione(numero.maggiore, numero.minore)}`, primaJson: null, dopoJson: { descrizione, fonte, contratti: comp.contratti.length, righe: comp.righe.length } }) as never);
    await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
  } catch (e) { // niente versioni a metà
    const cc = await db.select({ id: pianoContratto.id }).from(pianoContratto).where(eq(pianoContratto.versioneId, v.id));
    await db.batch([
      db.delete(pianoRiga).where(eq(pianoRiga.versioneId, v.id)),
      db.delete(pianoContratto).where(cc.length ? inArray(pianoContratto.id, cc.map((c) => c.id)) : eq(pianoContratto.versioneId, v.id)),
      db.delete(pianoVersione).where(eq(pianoVersione.id, v.id)),
    ]);
    throw e;
  }
  return { id: v.id, etichetta: etichettaVersione(numero.maggiore, numero.minore) };
}
