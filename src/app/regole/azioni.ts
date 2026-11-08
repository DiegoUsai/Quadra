"use server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { auditLog, eccezione, regola, snapshotScadenzario } from "@/db/schema";
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
