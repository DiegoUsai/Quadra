"use server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { auditLog, eccezione, mappaUtente, oreEccezione, regola, snapshotScadenzario } from "@/db/schema";
import { TIPI_ORE } from "@/lib/hub/eccezioni";
import { soglieValide } from "@/lib/regole/soglie";
import { aggiornaAnomalie } from "@/lib/regole/persistenza";

// Soglie, severità, attivazione e eccezioni sono modificabili solo dall'amministratore, con traccia di audit (specifiche 1.4, 11.1).
async function admin() {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata()) throw new Error("solo l'amministratore può modificare le regole");
  return s?.user?.email ?? "locale";
}

const oggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

async function ricalcola() {
  const [snap] = await getDb().select().from(snapshotScadenzario).orderBy(desc(snapshotScadenzario.id)).limit(1);
  if (snap) await aggiornaAnomalie(snap.id, oggi());
}

const Form = z.object({
  codice: z.string(),
  severita: z.enum(["bloccante", "alta", "media", "info"]),
  soglie: z.string(),
});

export async function salvaRegola(formData: FormData) {
  const chi = await admin(), db = getDb();
  const f = Form.parse({ codice: formData.get("codice"), severita: formData.get("severita"), soglie: formData.get("soglie") });
  const soglie = soglieValide(f.codice, f.soglie);
  const attiva = formData.get("attiva") === "on", notifica = formData.get("notifica") === "on";
  const [prima] = await db.select().from(regola).where(eq(regola.codice, f.codice));
  if (!prima) throw new Error("regola non trovata");
  await db.batch([
    db.update(regola).set({ severita: f.severita, sogliaJson: soglie, attiva, notifica, versione: prima.versione + 1 }).where(eq(regola.codice, f.codice)),
    db.insert(auditLog).values({ utente: chi, azione: "regola.modifica", entita: `regola:${f.codice}`,
      primaJson: { severita: prima.severita, soglie: prima.sogliaJson, attiva: prima.attiva, notifica: prima.notifica },
      dopoJson: { severita: f.severita, soglie, attiva, notifica } }),
  ]);
  await ricalcola();
  revalidatePath("/regole"); revalidatePath("/anomalie");
}

export async function eliminaEccezione(formData: FormData) {
  const chi = await admin(), db = getDb(), id = Number(formData.get("id"));
  const [e] = await db.select().from(eccezione).where(eq(eccezione.id, id));
  if (!e) throw new Error("eccezione non trovata");
  await db.batch([
    db.delete(eccezione).where(eq(eccezione.id, id)),
    db.insert(auditLog).values({ utente: chi, azione: "eccezione.elimina", entita: `eccezione:${id}`, primaJson: e, dopoJson: null }),
  ]);
  await ricalcola();
  revalidatePath("/regole"); revalidatePath("/anomalie");
}

// Collega il nome del PM (colonna PM dello scadenzario) all'utente Slack, per menzionarlo nelle notifiche (specifiche 10.3).
export async function salvaMappaPm(formData: FormData) {
  const chi = await admin(), db = getDb();
  const pm = String(formData.get("pm") ?? "").trim(), id = String(formData.get("slack") ?? "").trim();
  if (!pm) throw new Error("PM mancante");
  if (id && !/^[UW][A-Z0-9]{6,}$/.test(id)) throw new Error("L'ID utente Slack ha la forma U0123ABCD (profilo utente, Copia ID membro)");
  if (!id) await db.delete(mappaUtente).where(eq(mappaUtente.pmNome, pm));
  else await db.insert(mappaUtente).values({ pmNome: pm, slackUserId: id }).onConflictDoUpdate({ target: mappaUtente.pmNome, set: { slackUserId: id } });
  await db.insert(auditLog).values({ utente: chi, azione: "mappa_pm.salva", entita: `pm:${pm}`, primaJson: null, dopoJson: { slack: id || null } });
  revalidatePath("/regole");
}

// Eccezioni del controllo ore (part-time, presa servizio, remoti...): dati, con motivo, autore e audit.
const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const FormOre = z.object({
  tipo: z.enum(TIPI_ORE), nome: z.string().trim().min(3, "nome mancante"), motivo: z.string().trim().min(3, "il motivo è obbligatorio"),
  oreGiorno: z.string().optional(), liberi: z.string().optional(), dal: z.string().optional(), fino: z.string().optional(),
});

export async function aggiungiOreEccezione(formData: FormData) {
  const chi = await admin(), db = getDb();
  const f = FormOre.parse(Object.fromEntries(formData));
  const liberi = (f.liberi ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (liberi.some((g) => !GIORNI.includes(g))) throw new Error("giorni liberi: usa lun, mar, mer, gio, ven, sab, dom separati da virgola");
  const parametri = f.tipo !== "orario" ? {} : {
    ...(f.oreGiorno ? { oreGiorno: Number(f.oreGiorno.replace(",", ".")) } : {}),
    ...(liberi.length ? { ore: Object.fromEntries(liberi.map((g) => [g, 0])) } : {}),
  };
  if (f.tipo === "orario" && !Object.keys(parametri).length) throw new Error("orario: indica le ore al giorno o i giorni liberi");
  if (f.tipo === "presa_servizio" && !f.dal) throw new Error("presa servizio: indica il primo giorno in servizio");
  const riga = { tipo: f.tipo, nome: f.nome, parametriJson: parametri, motivo: f.motivo, approvataDa: chi, validaDal: f.dal || null, validaFino: f.fino || null };
  const [nuova] = await db.insert(oreEccezione).values(riga).returning({ id: oreEccezione.id });
  await db.insert(auditLog).values({ utente: chi, azione: "ore_eccezione.aggiungi", entita: `ore_eccezione:${nuova.id}`, primaJson: null, dopoJson: riga });
  revalidatePath("/regole");
}

export async function eliminaOreEccezione(formData: FormData) {
  const chi = await admin(), db = getDb(), id = Number(formData.get("id"));
  const [e] = await db.select().from(oreEccezione).where(eq(oreEccezione.id, id));
  if (!e) throw new Error("eccezione non trovata");
  await db.batch([
    db.delete(oreEccezione).where(eq(oreEccezione.id, id)),
    db.insert(auditLog).values({ utente: chi, azione: "ore_eccezione.elimina", entita: `ore_eccezione:${id}`, primaJson: e, dopoJson: null }),
  ]);
  revalidatePath("/regole");
}
