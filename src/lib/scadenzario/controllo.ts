import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rigaCorrente, runControllo, snapshotScadenzario, variazione } from "@/db/schema";
import { confronta, type Variazione } from "./diff";
import { leggiFogli, metaFile } from "./google";
import { leggiFoglio, type Riga } from "./righe";
import type { Foglio } from "./intestazioni";
import { aggiornaAnomalie } from "@/lib/regole/persistenza";
import { inviaNuove, inviaRisoluzioni, notificaErrore } from "@/lib/notifier/notifiche";

const FOGLI: Foglio[] = ["Contratti Attivi", "Costi/Ricavi", "Lookup"];
const a = <T,>(x: T[], n = 500) => Array.from({ length: Math.ceil(x.length / n) }, (_, i) => x.slice(i * n, (i + 1) * n));

// Righe da riscrivere in riga_corrente: quelle con dati cambiati e quelle solo spostate nel foglio (riga inserita o
// cancellata sopra), altrimenti il numero di riga resta vecchio e i link "Apri nel foglio" puntano alla riga sbagliata.
export function righeDaScrivere(prec: { foglio: string; chiave: string; hash: string; rigaFoglio: number | null }[], letture: { foglio: Foglio; righe: Riga[] }[]) {
  const out: { foglio: Foglio; r: Riga }[] = [];
  for (const l of letture) {
    const noti = new Map(prec.filter((p) => p.foglio === l.foglio).map((p) => [p.chiave, p]));
    for (const r of l.righe) {
      const p = noti.get(r.chiave);
      if (!p || p.hash !== r.hash || p.rigaFoglio !== r.rigaFoglio) out.push({ foglio: l.foglio, r });
    }
  }
  return out;
}

export type EsitoControllo = {
  esito: "nessuna_modifica" | "letto" | "struttura_cambiata" | "errore" | "occupato";
  runId: number; snapshotId?: number; baseline?: boolean; variazioni?: Record<string, Record<string, number>>; errore?: string;
  anomalie?: { nuove: number; risolte: number; riaperte: number; prodotte: number };
};

// Un run "in_corso" più vecchio di così è stato interrotto (Vercel ferma la funzione a 60 secondi): non blocca più nessuno.
const MINUTI_RUN_APPESO = 5;
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

// Regole sullo stato corrente e notifiche. Un loro errore non annulla la lettura: lo si restituisce al chiamante.
async function regoleENotifiche(runId: number, snapshotId: number): Promise<{ anomalie?: Awaited<ReturnType<typeof aggiornaAnomalie>>; errore?: string }> {
  try {
    const anomalie = await aggiornaAnomalie(snapshotId, oggiRoma());
    await inviaNuove(runId);
    await inviaRisoluzioni(runId);
    return { anomalie };
  } catch (e) { return { errore: "dopo la lettura: " + (e instanceof Error ? e.message : String(e)) }; }
}

export type OpzioniControllo = {
  // Il cron giornaliero rivaluta le regole anche se il foglio non è cambiato: eccezioni scadute e regole legate alla data
  // (scadenze, mesi trascorsi) cambiano esito con il passare dei giorni.
  rivaluta?: boolean;
};

// Una esecuzione del controllo (specifiche 6.1). Idempotente: se il file non è cambiato registra un run e termina.
// Registra SEMPRE un run, anche senza novità, per distinguere "nessuna anomalia" da "controllo non eseguito" (4.2).
// Un solo controllo alla volta: se un altro è in corso, questo si chiude come "occupato" senza leggere né scrivere.
export async function eseguiControllo(origine: "cron" | "apps_script" | "manuale", opzioni: OpzioniControllo = {}): Promise<EsitoControllo> {
  const db = getDb();
  const limite = new Date(Date.now() - MINUTI_RUN_APPESO * 60_000);
  await db.update(runControllo).set({ esito: "errore", terminatoIl: new Date(), errore: "interrotto: superato il tempo massimo della funzione" })
    .where(and(eq(runControllo.esito, "in_corso"), lt(runControllo.avviatoIl, limite)));
  const [run] = await db.insert(runControllo).values({ origine }).returning({ id: runControllo.id });
  // Fra due run partiti insieme prosegue quello con l'id più basso: l'altro lo vede e si ferma.
  const [prima] = await db.select({ id: runControllo.id }).from(runControllo)
    .where(and(eq(runControllo.esito, "in_corso"), lt(runControllo.id, run.id), gte(runControllo.avviatoIl, limite))).limit(1);
  if (prima) {
    const errore = `un altro controllo è in corso (run ${prima.id})`;
    await db.update(runControllo).set({ esito: "occupato", terminatoIl: new Date(), errore }).where(eq(runControllo.id, run.id));
    return { esito: "occupato", runId: run.id, errore };
  }
  const chiudi = async (esito: EsitoControllo["esito"], extra: Partial<typeof runControllo.$inferInsert> = {}) => {
    await db.update(runControllo).set({ esito, terminatoIl: new Date(), ...extra }).where(eq(runControllo.id, run.id));
  };
  const senzaModifiche = async (snapshotId: number): Promise<EsitoControllo> => {
    const dopo: Awaited<ReturnType<typeof regoleENotifiche>> = opzioni.rivaluta ? await regoleENotifiche(run.id, snapshotId) : {};
    await chiudi("nessuna_modifica", { snapshotId, errore: dopo.errore ?? null });
    if (dopo.errore) await notificaErrore("Controllo dello scadenzario: errore nel ricalcolo giornaliero", dopo.errore).catch(() => undefined);
    return { esito: "nessuna_modifica", runId: run.id, snapshotId, anomalie: dopo.anomalie, errore: dopo.errore };
  };
  try {
    const fileId = process.env.SCADENZARIO_SPREADSHEET_ID;
    if (!fileId) throw new Error("SCADENZARIO_SPREADSHEET_ID non impostata");
    const meta = await metaFile(fileId);
    const [ultimo] = await db.select().from(snapshotScadenzario).orderBy(desc(snapshotScadenzario.id)).limit(1);
    // Il modifiedTime di Drive può restare indietro di minuti rispetto a una modifica appena fatta: quando il controllo è
    // chiesto da una modifica (Apps Script) o da un utente si rilegge sempre; il confronto per hash evita snapshot inutili.
    if (origine === "cron" && ultimo && ultimo.driveModifiedTime.getTime() === new Date(meta.modifiedTime).getTime())
      return senzaModifiche(ultimo.id);

    const valori = await leggiFogli(fileId, FOGLI);
    const letture = FOGLI.map((f) => leggiFoglio(f, valori[f]));
    // S01: intestazione obbligatoria assente o duplicata -> ci si ferma, niente dati sbagliati.
    const rotte = letture.filter((l) => l.mappa.mancanti.length || l.mappa.duplicate.length);
    if (rotte.length) {
      const msg = rotte.map((l) => `${l.foglio}: mancanti [${l.mappa.mancanti.join(", ")}] duplicate [${l.mappa.duplicate.join(", ")}]`).join("; ");
      await chiudi("struttura_cambiata", { errore: "S01 " + msg });
      await notificaErrore("S01: la struttura dello scadenzario è cambiata", msg).catch(() => undefined);
      return { esito: "struttura_cambiata", runId: run.id, errore: msg };
    }

    const hashContenuto = createHash("sha256").update(letture.map((l) => l.righe.map((r) => r.chiave + r.hash).join()).join("|")).digest("hex");
    const prec = await db.select().from(rigaCorrente);
    const baseline = prec.length === 0;
    const cambi: { foglio: Foglio; v: Variazione[] }[] = letture.map((l) => ({
      foglio: l.foglio,
      v: confronta(prec.filter((p) => p.foglio === l.foglio).map((p) => ({ chiave: p.chiave, hash: p.hash, dati: p.dati as Record<string, unknown> })), l.righe),
    }));
    const nVar = baseline ? 0 : cambi.reduce((s, c) => s + c.v.length, 0);
    const riepilogo: Record<string, Record<string, number>> = {};
    for (const c of cambi) for (const x of c.v) { const r = (riepilogo[c.foglio] ??= {}); r[x.tipo] = (r[x.tipo] ?? 0) + 1; }

    // Snapshot nuovo solo se il contenuto è davvero cambiato (un salvataggio senza modifiche non crea snapshot).
    const [stesso] = ultimo ? [ultimo].filter((u) => u.hashContenuto === hashContenuto) : [];
    if (stesso) return senzaModifiche(stesso.id);

    const [snap] = await db.insert(snapshotScadenzario).values({
      driveModifiedTime: new Date(meta.modifiedTime), driveVersion: meta.version, hashContenuto,
      nRigheContratti: letture[0].righe.length, nRigheMovimenti: letture[1].righe.length, nVariazioni: nVar,
    }).returning({ id: snapshotScadenzario.id });

    // Scrittura in un'unica richiesta atomica: o entra tutto o niente (specifiche 14.2, nessuna perdita a metà run).
    const ops: Parameters<typeof db.batch>[0][number][] = [];
    if (!baseline)
      for (const c of cambi) for (const g of a(c.v))
        ops.push(db.insert(variazione).values(g.map((x) => ({ snapshotId: snap.id, foglio: c.foglio, chiave: x.chiave, tipo: x.tipo, prima: x.prima ?? null, dopo: x.dopo ?? null, campi: x.campi ?? null, rigaFoglio: x.rigaFoglio ?? null }))));
    for (const c of cambi) {
      const eliminate = c.v.filter((x) => x.tipo === "eliminata").map((x) => x.chiave);
      for (const g of a(eliminate)) ops.push(db.delete(rigaCorrente).where(sql`${rigaCorrente.foglio} = ${c.foglio} and ${inArray(rigaCorrente.chiave, g)}`));
    }
    for (const g of a(righeDaScrivere(prec, letture), 300))
      ops.push(db.insert(rigaCorrente).values(g.map(({ foglio, r }) => ({ foglio, chiave: r.chiave, hash: r.hash, dati: r.dati, rigaFoglio: r.rigaFoglio, ultimoSnapshotId: snap.id })))
        .onConflictDoUpdate({ target: [rigaCorrente.foglio, rigaCorrente.chiave], set: { hash: sql`excluded.hash`, dati: sql`excluded.dati`, rigaFoglio: sql`excluded.riga_foglio`, ultimoSnapshotId: snap.id } }));
    if (ops.length) await db.batch(ops as [typeof ops[0], ...typeof ops]);

    // Le regole girano sullo stato appena scritto; poi si inviano le notifiche. Un loro errore non annulla la lettura:
    // si registra nel run e, se serve, si segnala al canale tecnico.
    const { anomalie, errore: erroreDopo } = await regoleENotifiche(run.id, snap.id);
    await chiudi("letto", { snapshotId: snap.id, nVariazioni: nVar, errore: erroreDopo ?? null });
    if (erroreDopo) await notificaErrore("Controllo dello scadenzario: errore dopo la lettura", erroreDopo).catch(() => undefined);
    return { esito: "letto", runId: run.id, snapshotId: snap.id, baseline, variazioni: riepilogo, anomalie, errore: erroreDopo };
  } catch (e) {
    const errore = e instanceof Error ? e.message : String(e);
    await chiudi("errore", { errore });
    await notificaErrore("Controllo dello scadenzario non eseguito", errore).catch(() => undefined);
    return { esito: "errore", runId: run.id, errore };
  }
}
