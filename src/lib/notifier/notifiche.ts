import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalia, mappaUtente, notifica, regola } from "@/db/schema";
import { gidFogli } from "@/lib/scadenzario/google";
import { creaNotifier, type Notifier } from "./index";
import { messaggioErrore, messaggioNuove, messaggioRiepilogo, messaggioRisoluzione, type AnomaliaNotifica, type Contesto } from "./messaggi";

// Regole di invio (specifiche 10.2):
//  - subito le anomalie Bloccanti e Alte nuove, un messaggio per controllo;
//  - riepilogo giornaliero con nuove, risolte e aperte da più di 7 giorni;
//  - la risoluzione si notifica nello stesso thread;
//  - errori di sistema al canale tecnico, senza ripeterli;
//  - deduplica: un'anomalia già notificata e invariata non si rinvia (colonna notificata_il, azzerata alla riapertura).
// Le notifiche sono spente finché NOTIFICHE_ATTIVE non vale 1: va prima segnato lo stato attuale con `npm run notifiche:base`.
export const attive = () => process.env.NOTIFICHE_ATTIVE === "1";
const canaleAnomalie = () => process.env.SLACK_CHANNEL_ANOMALIE ?? "";
const canaleErrori = () => process.env.SLACK_CHANNEL_ERRORI || canaleAnomalie();
const baseUrl = () => (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
// La console serve solo a vedere i messaggi: non registra nulla, così provarla non segna le anomalie come notificate.
const persisti = (n: Notifier) => n.nome !== "console";
const hash = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 16);

type RigaDb = typeof anomalia.$inferSelect & { nomeRegola: string | null };
const aNotifica = (r: RigaDb, nomi: Map<string, string>): AnomaliaNotifica => ({ ...r, nomeRegola: nomi.get(r.regola) ?? r.regola, creataIl: r.creataIl });

async function contesto(): Promise<{ ctx: Contesto; nomi: Map<string, string> }> {
  const db = getDb();
  const [pm, regole] = await Promise.all([db.select().from(mappaUtente), db.select().from(regola)]);
  const idFoglio = process.env.SCADENZARIO_SPREADSHEET_ID;
  const gid = idFoglio ? await gidFogli(idFoglio).catch(() => null) : null;
  const slack = new Map(pm.filter((p) => p.slackUserId).map((p) => [p.pmNome, p.slackUserId!]));
  return {
    nomi: new Map(regole.map((r) => [r.codice, r.nome])),
    ctx: {
      baseUrl: baseUrl(),
      slackIdDi: (nome) => slack.get(nome) ?? null,
      linkFoglio: (a) => idFoglio && gid && a.foglio && a.rigaFoglio && gid[a.foglio] !== undefined
        ? `https://docs.google.com/spreadsheets/d/${idFoglio}/edit#gid=${gid[a.foglio]}&range=${a.rigaFoglio}:${a.rigaFoglio}` : null,
    },
  };
}

// Anomalie da segnalare subito: Bloccanti e Alte, aperte o riaperte, mai notificate, di regole con la notifica attiva.
export async function inviaNuove(runId: number | null, notifier: Notifier = creaNotifier()) {
  if (!attive()) return { saltato: "notifiche non attive" };
  const db = getDb();
  const righe = await db.select({ a: anomalia }).from(anomalia).innerJoin(regola, eq(regola.codice, anomalia.regola))
    .where(and(inArray(anomalia.stato, ["aperta", "riaperta"]), inArray(anomalia.severita, ["bloccante", "alta"]), isNull(anomalia.notificataIl), eq(regola.notifica, true), eq(regola.attiva, true)));
  if (!righe.length) return { inviate: 0 };
  const { ctx, nomi } = await contesto();
  const nuove = righe.map((r) => aNotifica({ ...r.a, nomeRegola: null }, nomi));
  const esito = await notifier.invia(messaggioNuove(canaleAnomalie(), nuove, ctx));
  if (!persisti(notifier)) return { inviate: nuove.length, prova: true };
  if (!esito.ok) {
    await db.insert(notifica).values({ tipo: "nuove", canale: canaleAnomalie(), runId, esito: "errore", errore: esito.errore });
    return { inviate: 0, errore: esito.errore }; // restano non notificate: si riprova al controllo successivo
  }
  await db.batch([
    db.insert(notifica).values(nuove.map((a) => ({ tipo: "nuove", canale: esito.canale, anomaliaId: a.id, runId, esito: "ok", threadTs: esito.ts }))),
    db.update(anomalia).set({ notificataIl: new Date() }).where(inArray(anomalia.id, nuove.map((a) => a.id))),
  ]);
  return { inviate: nuove.length };
}

// Le anomalie notificate e poi risolte si chiudono con una risposta nello stesso thread (una per thread).
export async function inviaRisoluzioni(runId: number | null, notifier: Notifier = creaNotifier()) {
  if (!attive()) return { saltato: "notifiche non attive" };
  const db = getDb();
  const righe = await db.execute(sql`
    select n.thread_ts, n.canale, a.id
    from notifica n join anomalia a on a.id = n.anomalia_id
    where n.tipo = 'nuove' and n.esito = 'ok' and a.stato = 'risolta'
      and not exists (select 1 from notifica r where r.tipo = 'risoluzione' and r.anomalia_id = a.id and r.inviata_il > n.inviata_il)
  `);
  const gruppi = new Map<string, { canale: string; ids: number[] }>();
  for (const r of righe.rows as { thread_ts: string; canale: string; id: number }[])
    (gruppi.get(r.thread_ts) ?? gruppi.set(r.thread_ts, { canale: r.canale, ids: [] }).get(r.thread_ts)!).ids.push(r.id);
  if (!gruppi.size) return { risposte: 0 };
  const nomi = new Map((await db.select().from(regola)).map((r) => [r.codice, r.nome]));
  let risposte = 0;
  for (const [thread, g] of gruppi) {
    const risolte = (await db.select().from(anomalia).where(inArray(anomalia.id, g.ids))).map((a) => aNotifica({ ...a, nomeRegola: null }, nomi));
    const esito = await notifier.invia(messaggioRisoluzione(g.canale, thread, risolte));
    if (!persisti(notifier)) { risposte++; continue; }
    if (!esito.ok) { await db.insert(notifica).values({ tipo: "risoluzione", canale: g.canale, runId, esito: "errore", threadTs: thread, errore: esito.errore }); continue; }
    await db.insert(notifica).values(g.ids.map((id) => ({ tipo: "risoluzione", canale: g.canale, anomaliaId: id, runId, esito: "ok", threadTs: thread })));
    risposte++;
  }
  return { risposte };
}

// Riepilogo giornaliero, una sola volta al giorno, nella fascia mattutina (ora di Roma). Su Vercel Hobby il cron gira
// "entro l'ora" indicata, quindi il messaggio parte tra le 08:00 e le 09:59 e non esattamente alle 08:30.
export async function riepilogoGiornaliero(opzioni: { forza?: boolean; ora?: number } = {}, notifier: Notifier = creaNotifier()) {
  if (!attive() && !opzioni.forza) return { saltato: "notifiche non attive" };
  const ora = opzioni.ora ?? +new Date().toLocaleTimeString("sv-SE", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).slice(0, 2);
  if (!opzioni.forza && (ora < 8 || ora > 9)) return { saltato: `fuori fascia (ore ${ora})` };
  const db = getDb();
  const [ultimo] = await db.select().from(notifica).where(and(eq(notifica.tipo, "riepilogo"), eq(notifica.esito, "ok"))).orderBy(desc(notifica.id)).limit(1);
  if (persisti(notifier) && !opzioni.forza && ultimo && ultimo.inviataIl.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }) === oggiRoma()) return { saltato: "già inviato oggi" };
  const da = ultimo?.inviataIl ?? new Date(Date.now() - 24 * 3600_000);
  const settimana = new Date(Date.now() - 7 * 86400_000);
  const { ctx, nomi } = await contesto();
  const da_trattare = inArray(anomalia.stato, ["aperta", "in_carico", "riaperta"]);
  const ric = and(inArray(anomalia.severita, ["bloccante", "alta", "media"]));
  const [nuove, aperte, vecchie, risolte] = await Promise.all([
    db.select().from(anomalia).where(and(da_trattare, gt(anomalia.creataIl, da), ric)),
    db.select().from(anomalia).where(and(da_trattare, ric)),
    db.select().from(anomalia).where(and(da_trattare, lt(anomalia.creataIl, settimana), inArray(anomalia.severita, ["bloccante", "alta"]))),
    db.select({ n: sql<number>`count(*)::int` }).from(anomalia).where(and(eq(anomalia.stato, "risolta"), gt(anomalia.risoltaIl, da))),
  ]);
  const m = (l: typeof nuove) => l.map((a) => aNotifica({ ...a, nomeRegola: null }, nomi));
  const esito = await notifier.invia(messaggioRiepilogo(canaleAnomalie(), { nuove: m(nuove), risolte: risolte[0]?.n ?? 0, vecchie: m(vecchie), aperte: m(aperte) }, ctx));
  if (!persisti(notifier)) return { inviato: true, prova: true, nuove: nuove.length, aperte: aperte.length, vecchie: vecchie.length };
  await db.insert(notifica).values({ tipo: "riepilogo", canale: canaleAnomalie(), esito: esito.ok ? "ok" : "errore", threadTs: esito.ok ? esito.ts : null, errore: esito.ok ? null : esito.errore });
  return { inviato: esito.ok, nuove: nuove.length, aperte: aperte.length, vecchie: vecchie.length };
}

// Errore di sistema (controllo non eseguito, struttura cambiata): non si ripete lo stesso errore per 6 ore.
export async function notificaErrore(titolo: string, dettaglio: string, notifier: Notifier = creaNotifier()) {
  if (!attive()) return { saltato: "notifiche non attive" };
  const db = getDb(), h = hash(titolo + dettaglio);
  const [recente] = await db.select().from(notifica).where(and(eq(notifica.tipo, "errore"), eq(notifica.payloadHash, h), eq(notifica.esito, "ok"), gt(notifica.inviataIl, new Date(Date.now() - 6 * 3600_000)))).limit(1);
  if (recente) return { saltato: "già segnalato" };
  const esito = await notifier.invia(messaggioErrore(canaleErrori(), titolo, dettaglio, baseUrl()));
  if (!persisti(notifier)) return { inviato: true, prova: true };
  await db.insert(notifica).values({ tipo: "errore", canale: canaleErrori(), esito: esito.ok ? "ok" : "errore", payloadHash: h, threadTs: esito.ok ? esito.ts : null, errore: esito.ok ? null : esito.errore });
  return { inviato: esito.ok };
}

// Segna come già notificate tutte le anomalie esistenti: da fare una volta, prima di accendere le notifiche,
// così arrivano solo le anomalie nuove e non l'intero arretrato.
export async function segnaStatoAttuale() {
  const r = await getDb().update(anomalia).set({ notificataIl: new Date() }).where(isNull(anomalia.notificataIl)).returning({ id: anomalia.id });
  return r.length;
}
