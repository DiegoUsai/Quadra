import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalia, anomaliaStorico, cgdProgetto, correzione, eccezione, regola, rigaCorrente, snapshotScadenzario, storicoDettaglio, variazione } from "@/db/schema";
import { REGOLE, eseguiRegole, type Anomalia, type ConfigRegola } from "./indice";
import { annoRifDi, indiceFine } from "./anno";
import type { Contesto, Dati } from "./tipi";

// Le chiavi ripetute del Lookup portano il numero d'ordine finale "#n" (scadenzario/righe.ts).
export const chiaveRipetuta = (chiave: string) => /#\d+$/.test(chiave);

const pezzi = <T,>(x: T[], n = 400) => Array.from({ length: Math.ceil(x.length / n) }, (_, i) => x.slice(i * n, (i + 1) * n));

// Inserisce nel database le regole che mancano (con i valori iniziali del codice) senza toccare quelle già modificate.
export async function sincronizzaRegole() {
  const db = getDb();
  await db.insert(regola).values(REGOLE.map((r) => ({
    codice: r.codice, nome: r.nome, descrizione: r.descrizione, gruppo: r.gruppo, severita: r.severita, sogliaJson: r.soglie, notifica: r.notifica ?? true,
  }))).onConflictDoNothing();
}

export async function contestoCorrente(oggi: string): Promise<Contesto> {
  const db = getDb();
  const righe = await db.select().from(rigaCorrente);
  const cv = (f: string) => righe.filter((r) => r.foglio === f).map((r) => ({ chiave: r.chiave, rigaFoglio: r.rigaFoglio, d: r.dati as Dati }));
  // Budget ponderato dei ricavi per progetto e mese dal seed storico (regole D01, D02)
  const budget = (await db.select({ progetto: storicoDettaglio.progetto, anno: storicoDettaglio.anno, mese: storicoDettaglio.mese, importo: sql<string>`sum(${storicoDettaglio.importoPesato})` })
    .from(storicoDettaglio).where(and(eq(storicoDettaglio.fonte, "budget"), eq(storicoDettaglio.tipo, "Ricavo"))).groupBy(storicoDettaglio.progetto, storicoDettaglio.anno, storicoDettaglio.mese))
    .map((b) => ({ ...b, importo: Number(b.importo) }));
  // Variazioni di importo degli ultimi giorni (regola D04)
  // La finestra segue la soglia «giorni» di D04 come è sulla pagina Regole (più un giorno di margine), non un numero fisso.
  const [d04] = await db.select({ soglie: regola.sogliaJson }).from(regola).where(eq(regola.codice, "D04"));
  const giorniD04 = Number((d04?.soglie as Record<string, unknown> | undefined)?.giorni ?? REGOLE.find((r) => r.codice === "D04")?.soglie.giorni);
  const finestra = Number.isFinite(giorniD04) && giorniD04 > 0 ? Math.ceil(giorniD04) + 1 : 30;
  const da = new Date(new Date(oggi + "T00:00:00Z").getTime() - finestra * 86400000);
  const vars = await db.select({ chiave: variazione.chiave, foglio: variazione.foglio, campi: variazione.campi, quando: snapshotScadenzario.lettoIl })
    .from(variazione).innerJoin(snapshotScadenzario, eq(variazione.snapshotId, snapshotScadenzario.id)).where(and(eq(variazione.tipo, "modificata"), gte(snapshotScadenzario.lettoIl, da)));
  const variazioni = vars.flatMap((v) => ((v.campi as { campo: string; prima: unknown; dopo: unknown }[] | null) ?? []).map((c) => ({ foglio: v.foglio, chiave: v.chiave, campo: c.campo, prima: c.prima, dopo: c.dopo, quando: v.quando.toISOString() })));
  const lookup = righe.filter((r) => r.foglio === "Lookup").map((r) => ({ campo: String((r.dati as Dati).campo), valore: String((r.dati as Dati).valore), rigaFoglio: r.rigaFoglio, ripetuto: chiaveRipetuta(r.chiave) }));
  const righeNuove = new Set((await db.select({ chiave: variazione.chiave }).from(variazione).where(and(eq(variazione.foglio, "Costi/Ricavi"), eq(variazione.tipo, "nuova")))).map((v) => v.chiave));
  const cgd = (await db.select().from(cgdProgetto)).map((p) => ({ id: p.id, nome: p.nome, ctr: p.ctr, importo: p.importo === null ? null : Number(p.importo), inizio: p.inizio, fine: p.fine, bloccato: p.bloccato }));
  return { oggi, contratti: cv("Contratti Attivi"), movimenti: cv("Costi/Ricavi"), budget, variazioni, lookup, righeNuove, cgd };
}

// Un asterisco finale vale come jolly: "C*" copre tutte le regole del gruppo C, "LOTTO_*" tutti i contratti con quel prefisso.
export const combacia = (modello: string, valore: string) => (modello.endsWith("*") ? valore.startsWith(modello.slice(0, -1)) : modello === valore);

const attiva = (e: typeof eccezione.$inferSelect, a: Anomalia, oggi: string) =>
  combacia(e.regola, a.regola) && combacia(e.entitaChiave, a.entitaChiave)
  && (e.periodoAnno === null || (a.periodo && e.periodoAnno === a.periodo.anno && e.periodoMese === a.periodo.mese))
  && e.validaDal <= oggi && (e.validaFino === null || e.validaFino >= oggi);

// Una correzione attiva (tetto del canone, riclassificazione...) copre le anomalie dei canoni (gruppo C) del contratto o del
// progetto cui si riferisce: la segnalazione passa a "riconosciuta" perché il dato è già trattato (specifiche 7.8, esempio 1).
export const correzioneCopre = (c: typeof correzione.$inferSelect, a: Anomalia, oggi: string) => {
  if (!a.regola.startsWith("C") || c.validaDal > oggi) return false;
  const p = c.parametriJson as { anno?: number; mese?: number };
  const prog = (a.valori as { progetto?: string } | undefined)?.progetto;
  return (c.entitaChiave === a.entitaChiave || c.entitaChiave === prog) && (p.anno === undefined || p.anno === a.periodo?.anno) && (p.mese === undefined || p.mese === a.periodo?.mese);
};

// Prima esecuzione di una regola con base silenziosa per quel tipo di entità: le anomalie già presenti non si notificano
// (si registrano come già notificate); restano notificate quelle nate dopo la lettura di base (`nuovaDaOggi`).
export const silenzioso = (a: Pick<Anomalia, "regola" | "entitaTipo" | "baseline" | "nuovaDaOggi">, noti: Set<string>) =>
  a.baseline && !a.nuovaDaOggi && !noti.has(`${a.regola}|${a.entitaTipo}`);

// Anomalie non più prodotte da passare a "risolta". Una regola disattivata non gira, quindi le sue anomalie non "spariscono":
// restano come sono, senza risoluzioni né messaggi su Slack, e riprendono il loro corso quando la regola torna attiva.
export const daRisolvere = <T extends { fingerprint: string; regola: string; stato: string }>(esistenti: T[], viste: Set<string>, cfg: Record<string, Partial<ConfigRegola>>) =>
  esistenti.filter((e) => !viste.has(e.fingerprint) && e.stato !== "risolta" && cfg[e.regola]?.attiva !== false);

// Confronta le anomalie prodotte dalle regole con quelle già registrate (specifiche 5.2, 7.7, 10.2):
// nuova -> aperta; ricomparsa dopo la risoluzione -> riaperta; sparita -> risolta; eccezione valida -> riconosciuta;
// eccezione scaduta -> riaperta. Una anomalia già nota e invariata non cambia (niente rumore).
export async function aggiornaAnomalie(snapshotId: number, oggi: string) {
  const db = getDb();
  await sincronizzaRegole();
  const cfg: Record<string, Partial<ConfigRegola>> = {};
  for (const r of await db.select().from(regola))
    cfg[r.codice] = { attiva: r.attiva, severita: r.severita as ConfigRegola["severita"], soglie: r.sogliaJson as Record<string, unknown>, notifica: r.notifica };

  const ctx = await contestoCorrente(oggi), fine = indiceFine(ctx);
  const prodotte = eseguiRegole(ctx, cfg);
  const esistenti = new Map((await db.select().from(anomalia)).map((a) => [a.fingerprint, a]));
  const eccezioni = await db.select().from(eccezione);
  const correzioni = await db.select().from(correzione).where(eq(correzione.attiva, true));
  const noti = new Set([...esistenti.values()].map((e) => `${e.regola}|${e.entitaTipo}`));
  const viste = new Set<string>();
  const nuove: (typeof anomalia.$inferInsert)[] = [];
  const cambi: { id: number; stato: string; nota?: string }[] = [];
  const aggiorna: { id: number; a: Anomalia; anno: ReturnType<typeof annoRifDi> }[] = [];
  const viste2: number[] = []; // anomalie ancora presenti: si aggiorna solo l'ultimo snapshot visto

  for (const a of prodotte) {
    if (viste.has(a.fingerprint)) continue; // due righe con la stessa chiave logica: una sola segnalazione
    viste.add(a.fingerprint);
    const conEccezione = eccezioni.some((e) => attiva(e, a, oggi)) || correzioni.some((c) => correzioneCopre(c, a, oggi));
    const e = esistenti.get(a.fingerprint), anno = annoRifDi(a, fine);
    if (!e) {
      nuove.push({
        fingerprint: a.fingerprint, regola: a.regola, entitaTipo: a.entitaTipo, entitaChiave: a.entitaChiave, periodoAnno: a.periodo?.anno ?? null, periodoMese: a.periodo?.mese ?? null,
        severita: a.severita, messaggio: a.messaggio, valoriJson: a.valori ?? null, stato: conEccezione ? "riconosciuta" : "aperta",
        primaVistaSnapshot: snapshotId, ultimaVistaSnapshot: snapshotId, rigaFoglio: a.rigaFoglio ?? null, foglio: a.foglio, pm: a.pm ?? null,
        notificataIl: silenzioso(a, noti) ? new Date() : null, annoRif: anno?.anno ?? null, tipoAnno: anno?.tipo ?? null,
      });
      continue;
    }
    if (e.messaggio !== a.messaggio || e.severita !== a.severita || e.rigaFoglio !== (a.rigaFoglio ?? null) || e.pm !== (a.pm ?? null)
      || e.annoRif !== (anno?.anno ?? null) || e.tipoAnno !== (anno?.tipo ?? null)) aggiorna.push({ id: e.id, a, anno }); // l'anno cambia se cambia la data fine del contratto
    viste2.push(e.id);
    // Una risolta che ricompare sotto un'eccezione valida va subito in «riconosciuta»: da riaperta verrebbe notificata.
    if (e.stato === "risolta") cambi.push(conEccezione ? { id: e.id, stato: "riconosciuta", nota: "ricomparsa, coperta da un'eccezione valida" } : { id: e.id, stato: "riaperta", nota: "ricomparsa dopo la risoluzione" });
    else if (e.stato === "riconosciuta" && !conEccezione) cambi.push({ id: e.id, stato: "riaperta", nota: "eccezione scaduta o rimossa" });
    else if (conEccezione && e.stato !== "riconosciuta") cambi.push({ id: e.id, stato: "riconosciuta", nota: "eccezione valida" });
  }
  const sparite = daRisolvere([...esistenti.values()], viste, cfg);
  for (const e of sparite) cambi.push({ id: e.id, stato: "risolta", nota: "non più rilevata dalla regola" });

  // Scrittura in un unico passaggio atomico: nessuna anomalia persa a metà run (specifiche 14.2)
  const ops: Parameters<typeof db.batch>[0][number][] = [];
  // Rete di sicurezza contro due ricalcoli sovrapposti (controllo e lettura del CGD): una fingerprint già inserita si salta.
  for (const g of pezzi(nuove)) ops.push(db.insert(anomalia).values(g).onConflictDoNothing({ target: anomalia.fingerprint }));
  for (const g of pezzi(viste2))
    ops.push(db.update(anomalia).set({ ultimaVistaSnapshot: snapshotId }).where(inArray(anomalia.id, g)));
  for (const { id, a, anno } of aggiorna)
    ops.push(db.update(anomalia).set({ messaggio: a.messaggio, valoriJson: a.valori ?? null, severita: a.severita, rigaFoglio: a.rigaFoglio ?? null, pm: a.pm ?? null, annoRif: anno?.anno ?? null, tipoAnno: anno?.tipo ?? null }).where(eq(anomalia.id, id)));
  for (const stato of ["riaperta", "riconosciuta", "risolta"]) {
    const ids = cambi.filter((c) => c.stato === stato).map((c) => c.id);
    for (const g of pezzi(ids)) {
      ops.push(db.update(anomalia).set({ stato, risoltaIl: stato === "risolta" ? new Date() : null, ...(stato === "riaperta" ? { notificataIl: null } : {}) }).where(inArray(anomalia.id, g)));
      ops.push(db.insert(anomaliaStorico).values(g.map((id) => ({ anomaliaId: id, utente: "sistema", a: stato, nota: cambi.find((c) => c.id === id)?.nota ?? null }))));
    }
  }
  if (ops.length) await db.batch(ops as [(typeof ops)[0], ...typeof ops]);
  return { nuove: nuove.length, risolte: cambi.filter((c) => c.stato === "risolta").length, riaperte: cambi.filter((c) => c.stato === "riaperta").length, prodotte: viste.size };
}
