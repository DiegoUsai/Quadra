import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { oreAnomalia, oreControllo } from "@/db/schema";
import { creaNotifier } from "@/lib/notifier";
import { leggiFogli } from "@/lib/scadenzario/google";
import { caricaEccezioni, opzioniOre } from "./eccezioni";
import { chiaveNome, controllaOre, hubOre, leggiAssenze, type Anomalia, type RispostaHub } from "./ore";

export type Giorno = { g: string; ore: number };
export type Prodotta = { fingerprint: string; codice: string; nome: string; anno: number; mese: number; giorni: Giorno[]; oreTotali: number };
export type Esistente = { id: number; fingerprint: string; stato: string; giorni: unknown };

const mm = (n: number) => String(n).padStart(2, "0");

/** Una segnalazione per codice, persona e mese, con i giorni dentro (non una riga per giorno). */
export function raggruppa(an: Anomalia[], hub: RispostaHub): Prodotta[] {
  const nomi = new Map(hub.users.map((u) => [u.user.codiceDipendente, `${u.user.lastName} ${u.user.firstName}`.replace(/\s+/g, " ").trim()]));
  const out = new Map<string, Prodotta>();
  for (const a of an) {
    const nome = a.codiceDipendente !== undefined ? nomi.get(a.codiceDipendente) ?? String(a.codiceDipendente) : a.dettaglio ?? "?";
    const fingerprint = `${a.codice}|${chiaveNome(nome)}|${hub.year}-${mm(hub.month)}`;
    const p = out.get(fingerprint) ?? { fingerprint, codice: a.codice, nome, anno: hub.year, mese: hub.month, giorni: [], oreTotali: 0 };
    if (a.giorno) p.giorni.push({ g: a.giorno, ore: a.ore ?? 0 });
    p.oreTotali += a.ore ?? 0;
    out.set(fingerprint, p);
  }
  return [...out.values()];
}

/** Confronto con quanto già salvato: nuova -> aperta; cambiata -> aggiornata (non si rinotifica); ricomparsa -> riaperta; sparita -> risolta. */
export function riconcilia(esistenti: Esistente[], prodotte: Prodotta[]) {
  const per = new Map(esistenti.map((e) => [e.fingerprint, e]));
  const viste = new Set(prodotte.map((p) => p.fingerprint));
  return {
    nuove: prodotte.filter((p) => !per.has(p.fingerprint)),
    aggiorna: prodotte.flatMap((p) => { const e = per.get(p.fingerprint); return e && (e.stato === "risolta" || JSON.stringify(e.giorni) !== JSON.stringify(p.giorni)) ? [{ id: e.id, p, riapre: e.stato === "risolta" }] : []; }),
    presenti: prodotte.flatMap((p) => per.get(p.fingerprint)?.id ?? []),
    risolte: esistenti.filter((e) => !viste.has(e.fingerprint) && e.stato !== "risolta").map((e) => e.id),
  };
}

export async function leggiAssenzeMese(anno: number, mese: number) {
  const id = process.env.ASSENZE_SPREADSHEET_ID?.match(/[\w-]{44}/)?.[0]; // accetta anche l'URL incollato per intero
  if (!id) throw new Error("ASSENZE_SPREADSHEET_ID non impostata");
  const tutte = leggiAssenze((await leggiFogli(id, ["Elenco Assenze"]))["Elenco Assenze"]);
  return tutte.filter((a) => a.giorno.endsWith(`/${mm(mese)}/${anno}`));
}

const ETICHETTE: Record<string, string> = { ORE_MANCANTI: "ore mancanti", POSSIBILE_PATRONO: "possibile patrono", ORE_IN_ASSENZA: "ore in assenza", ASSENZA_DISCORDANTE: "assenza solo su HUB", NOME_NON_AGGANCIATO: "nome non agganciato" };
export const etichetta = (c: string) => ETICHETTE[c] ?? c;

export async function eseguiControlloOre(anno: number, mese: number, bu = process.env.HUB_BU ?? "Diego") {
  const db = getDb();
  const hub = await hubOre(anno, mese);
  const assenze = await leggiAssenzeMese(anno, mese);
  const prodotte = raggruppa(controllaOre(hub, assenze, opzioniOre(await caricaEccezioni(), bu)), hub);
  const esistenti = await db.select().from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese)));
  const r = riconcilia(esistenti, prodotte);
  const riga = (p: Prodotta) => ({ fingerprint: p.fingerprint, codice: p.codice, nome: p.nome, anno: p.anno, mese: p.mese, giorni: p.giorni, oreTotali: String(p.oreTotali) });
  const ops: Parameters<typeof db.batch>[0][number][] = [];
  if (r.nuove.length) ops.push(db.insert(oreAnomalia).values(r.nuove.map(riga)));
  for (const a of r.aggiorna) ops.push(db.update(oreAnomalia).set({ giorni: a.p.giorni, oreTotali: String(a.p.oreTotali), ...(a.riapre ? { stato: "aperta", risoltaIl: null, notificataIl: null } : {}) }).where(eq(oreAnomalia.id, a.id)));
  for (const id of r.presenti) ops.push(db.update(oreAnomalia).set({ ultimaVista: new Date() }).where(eq(oreAnomalia.id, id)));
  for (const id of r.risolte) ops.push(db.update(oreAnomalia).set({ stato: "risolta", risoltaIl: new Date() }).where(eq(oreAnomalia.id, id)));
  const stato = { eseguitoIl: new Date(), segnalazioni: prodotte.length, utentiHub: hub.users.length };
  ops.push(db.insert(oreControllo).values({ anno, mese, ...stato }).onConflictDoUpdate({ target: [oreControllo.anno, oreControllo.mese], set: stato }));
  if (ops.length) await db.batch(ops as [(typeof ops)[0], ...typeof ops]);
  return { anno, mese, utentiHub: hub.users.length, righeAssenza: assenze.length, segnalazioni: prodotte.length, nuove: r.nuove.length, risolte: r.risolte.length, riaperte: r.aggiorna.filter((a) => a.riapre).length };
}

/** Su Slack solo conteggi, mai nomi (specifiche 16, punto 32). Si invia solo se NOTIFICHE_ATTIVE=1. */
export async function notificaOre(anno: number, mese: number) {
  if (process.env.NOTIFICHE_ATTIVE !== "1") return { saltato: "notifiche non attive" };
  const db = getDb();
  const daAvvisare = (await db.select().from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese), eq(oreAnomalia.stato, "aperta"))))
    .filter((a) => !a.notificataIl);
  if (!daAvvisare.length) return { inviate: 0 };
  const per: Record<string, number> = {};
  for (const a of daAvvisare) per[a.codice] = (per[a.codice] ?? 0) + 1;
  const elenco = Object.entries(per).map(([c, n]) => `${n} ${etichetta(c)}`).join(", ");
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  const esito = await creaNotifier().invia({ canale: process.env.SLACK_CHANNEL_ANOMALIE ?? "", testo: `Controllo ore ${mm(mese)}/${anno}: ${daAvvisare.length} nuove segnalazioni (${elenco}).${base ? ` Dettaglio: ${base}/ore?anno=${anno}&mese=${mese}` : ""}` });
  if (!esito.ok) return { inviate: 0, errore: esito.errore };
  for (const a of daAvvisare) await db.update(oreAnomalia).set({ notificataIl: new Date() }).where(eq(oreAnomalia.id, a.id));
  return { inviate: daAvvisare.length };
}
