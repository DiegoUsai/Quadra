import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalia, anomaliaStorico, eccezione, regola, rigaCorrente } from "@/db/schema";
import { REGOLE, eseguiRegole, type Anomalia, type ConfigRegola } from "./indice";
import type { Contesto, Dati } from "./tipi";

const pezzi = <T,>(x: T[], n = 400) => Array.from({ length: Math.ceil(x.length / n) }, (_, i) => x.slice(i * n, (i + 1) * n));

// Inserisce nel database le regole che mancano (con i valori iniziali del codice) senza toccare quelle già modificate.
export async function sincronizzaRegole() {
  const db = getDb();
  await db.insert(regola).values(REGOLE.map((r) => ({
    codice: r.codice, nome: r.nome, descrizione: r.descrizione, gruppo: r.gruppo, severita: r.severita, sogliaJson: r.soglie, notifica: r.notifica ?? true,
  }))).onConflictDoNothing();
}

export async function contestoCorrente(oggi: string): Promise<Contesto> {
  const righe = await getDb().select().from(rigaCorrente);
  const cv = (f: string) => righe.filter((r) => r.foglio === f).map((r) => ({ chiave: r.chiave, rigaFoglio: r.rigaFoglio, d: r.dati as Dati }));
  return { oggi, contratti: cv("Contratti Attivi"), movimenti: cv("Costi/Ricavi") };
}

const attiva = (e: typeof eccezione.$inferSelect, a: Anomalia, oggi: string) =>
  e.regola === a.regola && e.entitaChiave === a.entitaChiave
  && (e.periodoAnno === null || (a.periodo && e.periodoAnno === a.periodo.anno && e.periodoMese === a.periodo.mese))
  && e.validaDal <= oggi && (e.validaFino === null || e.validaFino >= oggi);

// Confronta le anomalie prodotte dalle regole con quelle già registrate (specifiche 5.2, 7.7, 10.2):
// nuova -> aperta; ricomparsa dopo la risoluzione -> riaperta; sparita -> risolta; eccezione valida -> riconosciuta;
// eccezione scaduta -> riaperta. Una anomalia già nota e invariata non cambia (niente rumore).
export async function aggiornaAnomalie(snapshotId: number, oggi: string) {
  const db = getDb();
  await sincronizzaRegole();
  const cfg: Record<string, Partial<ConfigRegola>> = {};
  for (const r of await db.select().from(regola))
    cfg[r.codice] = { attiva: r.attiva, severita: r.severita as ConfigRegola["severita"], soglie: r.sogliaJson as Record<string, unknown>, notifica: r.notifica };

  const prodotte = eseguiRegole(await contestoCorrente(oggi), cfg);
  const esistenti = new Map((await db.select().from(anomalia)).map((a) => [a.fingerprint, a]));
  const eccezioni = await db.select().from(eccezione);
  const viste = new Set<string>();
  const nuove: (typeof anomalia.$inferInsert)[] = [];
  const cambi: { id: number; stato: string; nota?: string }[] = [];
  const aggiorna: { id: number; a: Anomalia }[] = [];
  const viste2: number[] = []; // anomalie ancora presenti: si aggiorna solo l'ultimo snapshot visto

  for (const a of prodotte) {
    if (viste.has(a.fingerprint)) continue; // due righe con la stessa chiave logica: una sola segnalazione
    viste.add(a.fingerprint);
    const conEccezione = eccezioni.some((e) => attiva(e, a, oggi));
    const e = esistenti.get(a.fingerprint);
    if (!e) {
      nuove.push({
        fingerprint: a.fingerprint, regola: a.regola, entitaTipo: a.entitaTipo, entitaChiave: a.entitaChiave, periodoAnno: a.periodo?.anno ?? null, periodoMese: a.periodo?.mese ?? null,
        severita: a.severita, messaggio: a.messaggio, valoriJson: a.valori ?? null, stato: conEccezione ? "riconosciuta" : "aperta",
        primaVistaSnapshot: snapshotId, ultimaVistaSnapshot: snapshotId, rigaFoglio: a.rigaFoglio ?? null, foglio: a.foglio, pm: a.pm ?? null,
      });
      continue;
    }
    if (e.messaggio !== a.messaggio || e.severita !== a.severita || e.rigaFoglio !== (a.rigaFoglio ?? null) || e.pm !== (a.pm ?? null)) aggiorna.push({ id: e.id, a });
    viste2.push(e.id);
    if (e.stato === "risolta") cambi.push({ id: e.id, stato: "riaperta", nota: "ricomparsa dopo la risoluzione" });
    else if (e.stato === "riconosciuta" && !conEccezione) cambi.push({ id: e.id, stato: "riaperta", nota: "eccezione scaduta o rimossa" });
    else if (conEccezione && e.stato !== "riconosciuta") cambi.push({ id: e.id, stato: "riconosciuta", nota: "eccezione valida" });
  }
  const sparite = [...esistenti.values()].filter((e) => !viste.has(e.fingerprint) && e.stato !== "risolta");
  for (const e of sparite) cambi.push({ id: e.id, stato: "risolta", nota: "non più rilevata dalla regola" });

  // Scrittura in un unico passaggio atomico: nessuna anomalia persa a metà run (specifiche 14.2)
  const ops: Parameters<typeof db.batch>[0][number][] = [];
  for (const g of pezzi(nuove)) ops.push(db.insert(anomalia).values(g));
  for (const g of pezzi(viste2))
    ops.push(db.update(anomalia).set({ ultimaVistaSnapshot: snapshotId }).where(inArray(anomalia.id, g)));
  for (const { id, a } of aggiorna)
    ops.push(db.update(anomalia).set({ messaggio: a.messaggio, valoriJson: a.valori ?? null, severita: a.severita, rigaFoglio: a.rigaFoglio ?? null, pm: a.pm ?? null }).where(eq(anomalia.id, id)));
  for (const stato of ["riaperta", "riconosciuta", "risolta"]) {
    const ids = cambi.filter((c) => c.stato === stato).map((c) => c.id);
    for (const g of pezzi(ids)) {
      ops.push(db.update(anomalia).set({ stato, risoltaIl: stato === "risolta" ? new Date() : null }).where(inArray(anomalia.id, g)));
      ops.push(db.insert(anomaliaStorico).values(g.map((id) => ({ anomaliaId: id, utente: "sistema", a: stato, nota: cambi.find((c) => c.id === id)?.nota ?? null }))));
    }
  }
  if (ops.length) await db.batch(ops as [(typeof ops)[0], ...typeof ops]);
  return { nuove: nuove.length, risolte: cambi.filter((c) => c.stato === "risolta").length, riaperte: cambi.filter((c) => c.stato === "riaperta").length, prodotte: viste.size };
}
