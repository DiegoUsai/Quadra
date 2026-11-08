import { createHash } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
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

export type EsitoControllo = {
  esito: "nessuna_modifica" | "letto" | "struttura_cambiata" | "errore";
  runId: number; snapshotId?: number; baseline?: boolean; variazioni?: Record<string, Record<string, number>>; errore?: string;
  anomalie?: { nuove: number; risolte: number; riaperte: number; prodotte: number };
};

// Una esecuzione del controllo (specifiche 6.1). Idempotente: se il file non è cambiato registra un run e termina.
// Registra SEMPRE un run, anche senza novità, per distinguere "nessuna anomalia" da "controllo non eseguito" (4.2).
export async function eseguiControllo(origine: "cron" | "apps_script" | "manuale"): Promise<EsitoControllo> {
  const db = getDb();
  const [run] = await db.insert(runControllo).values({ origine }).returning({ id: runControllo.id });
  const chiudi = async (esito: EsitoControllo["esito"], extra: Partial<typeof runControllo.$inferInsert> = {}) => {
    await db.update(runControllo).set({ esito, terminatoIl: new Date(), ...extra }).where(eq(runControllo.id, run.id));
  };
  try {
    const fileId = process.env.SCADENZARIO_SPREADSHEET_ID;
    if (!fileId) throw new Error("SCADENZARIO_SPREADSHEET_ID non impostata");
    const meta = await metaFile(fileId);
    const [ultimo] = await db.select().from(snapshotScadenzario).orderBy(desc(snapshotScadenzario.id)).limit(1);
    // Il modifiedTime di Drive può restare indietro di minuti rispetto a una modifica appena fatta: quando il controllo è
    // chiesto da una modifica (Apps Script) o da un utente si rilegge sempre; il confronto per hash evita snapshot inutili.
    if (origine === "cron" && ultimo && ultimo.driveModifiedTime.getTime() === new Date(meta.modifiedTime).getTime()) {
      await chiudi("nessuna_modifica", { snapshotId: ultimo.id });
      return { esito: "nessuna_modifica", runId: run.id, snapshotId: ultimo.id };
    }

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
    if (stesso) {
      await chiudi("nessuna_modifica", { snapshotId: stesso.id });
      return { esito: "nessuna_modifica", runId: run.id, snapshotId: stesso.id };
    }

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
    const righeDaScrivere: { foglio: Foglio; r: Riga }[] = [];
    for (const l of letture) {
      const noti = new Map(prec.filter((p) => p.foglio === l.foglio).map((p) => [p.chiave, p.hash]));
      for (const r of l.righe) if (noti.get(r.chiave) !== r.hash) righeDaScrivere.push({ foglio: l.foglio, r });
    }
    for (const g of a(righeDaScrivere, 300))
      ops.push(db.insert(rigaCorrente).values(g.map(({ foglio, r }) => ({ foglio, chiave: r.chiave, hash: r.hash, dati: r.dati, rigaFoglio: r.rigaFoglio, ultimoSnapshotId: snap.id })))
        .onConflictDoUpdate({ target: [rigaCorrente.foglio, rigaCorrente.chiave], set: { hash: sql`excluded.hash`, dati: sql`excluded.dati`, rigaFoglio: sql`excluded.riga_foglio`, ultimoSnapshotId: snap.id } }));
    await db.batch(ops as [typeof ops[0], ...typeof ops]);

    // Le regole girano sullo stato appena scritto; poi si inviano le notifiche. Un loro errore non annulla la lettura:
    // si registra nel run e, se serve, si segnala al canale tecnico.
    let anomalie: Awaited<ReturnType<typeof aggiornaAnomalie>> | undefined, erroreDopo: string | undefined;
    try {
      anomalie = await aggiornaAnomalie(snap.id, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }));
      await inviaNuove(run.id);
      await inviaRisoluzioni(run.id);
    } catch (e) { erroreDopo = "dopo la lettura: " + (e instanceof Error ? e.message : String(e)); }
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
