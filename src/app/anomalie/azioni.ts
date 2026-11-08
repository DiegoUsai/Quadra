"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { anomalia, anomaliaStorico, auditLog, eccezione } from "@/db/schema";

// Presa in carico, riconoscimento come eccezione e risoluzione con nota (specifiche 11.1). Solo Editor e Admin.
async function utente() {
  const s = await auth();
  const ruolo = s?.user?.ruolo ?? (authSaltata() ? "admin" : null);
  if (ruolo !== "admin" && ruolo !== "editor") throw new Error("permesso negato");
  return s?.user?.email ?? "locale";
}

async function cambia(id: number, a: string, nota: string | null, extra: Partial<typeof anomalia.$inferInsert> = {}) {
  const chi = await utente(), db = getDb();
  const [prima] = await db.select().from(anomalia).where(eq(anomalia.id, id));
  if (!prima) throw new Error("anomalia non trovata");
  await db.batch([
    db.update(anomalia).set({ stato: a, notaRisoluzione: nota ?? prima.notaRisoluzione, risoltaIl: a === "risolta" ? new Date() : null, ...extra }).where(eq(anomalia.id, id)),
    db.insert(anomaliaStorico).values({ anomaliaId: id, utente: chi, da: prima.stato, a, nota }),
    db.insert(auditLog).values({ utente: chi, azione: "anomalia." + a, entita: `anomalia:${id}`, primaJson: { stato: prima.stato }, dopoJson: { stato: a, nota } }),
  ]);
  revalidatePath("/anomalie");
}

export async function prendiInCarico(formData: FormData) {
  await cambia(Number(formData.get("id")), "in_carico", null, { assegnataA: await utente() });
}

export async function risolvi(formData: FormData) {
  const nota = String(formData.get("nota") ?? "").trim();
  if (!nota) throw new Error("la nota è obbligatoria");
  await cambia(Number(formData.get("id")), "risolta", nota);
}

// Riconosce come eccezione: richiede motivo e, facoltativamente, una scadenza. Un'eccezione scaduta riapre l'anomalia.
export async function riconosci(formData: FormData) {
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) throw new Error("il motivo è obbligatorio");
  const fino = String(formData.get("fino") ?? "").trim() || null;
  const chi = await utente(), db = getDb(), id = Number(formData.get("id"));
  const [a] = await db.select().from(anomalia).where(eq(anomalia.id, id));
  if (!a) throw new Error("anomalia non trovata");
  await db.insert(eccezione).values({
    regola: a.regola, entitaChiave: a.entitaChiave, periodoAnno: a.periodoAnno, periodoMese: a.periodoMese, motivo, approvataDa: chi,
    validaDal: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }), validaFino: fino,
  });
  await cambia(id, "riconosciuta", motivo);
}
