import { and, asc, eq, sql } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { oreAnomalia } from "@/db/schema";
import { etichetta, type Giorno } from "@/lib/hub/controllo";
import Barra from "../Barra";
import { controllaMese } from "./azioni";

export const dynamic = "force-dynamic";
const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export default async function Ore({ searchParams }: { searchParams: Promise<{ anno?: string; mese?: string; esito?: string; errore?: string }> }) {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata())
    return (<><Barra corrente="/ore" /><main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}><h1>Ore rendicontate</h1><p style={muto}>Questa pagina è riservata all&apos;amministratore: contiene dati personali.</p></main></>);
  const q = await searchParams;
  const ora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const anno = Number(q.anno) || ora.getFullYear(), mese = Number(q.mese) || ora.getMonth() + 1;
  const db = getDb();
  const [righe, [stato]] = await Promise.all([
    db.select().from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese), eq(oreAnomalia.stato, "aperta"))).orderBy(asc(oreAnomalia.codice), asc(oreAnomalia.nome)),
    db.select({ n: sql<number>`count(*)::int`, ultimo: sql<Date | null>`max(${oreAnomalia.ultimaVista})` }).from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese))),
  ]);
  const codici = [...new Set(righe.map((r) => r.codice))];
  const gg = (g: Giorno[]) => g.map((x) => `${x.g.slice(0, 2)}${x.ore ? ` (${x.ore} h)` : ""}`).join(", ");
  const maiControllato = stato.n === 0; // nessuna riga in nessuno stato: mese mai controllato oppure senza alcuna segnalazione
  return (
    <>
      <Barra corrente="/ore" />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontFamily: "var(--font-anthropic-serif)", fontWeight: 700, marginBottom: 4 }}>Ore rendicontate e assenze</h1>
        <p style={{ ...muto, marginTop: 0 }}>HUB contro Elenco Assenze, solo giorni già chiusi. Visibile solo all&apos;amministratore; su Slack vanno solo i conteggi.</p>
        {q.errore && <p role="alert" style={{ color: "var(--color-danger, #b3261e)" }}>{q.errore}</p>}
        {q.esito && <p role="status">{q.esito}</p>}
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
          <label>Mese<br /><select name="mese" defaultValue={mese} className="btn">{MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          <label>Anno<br /><input name="anno" type="number" min={2024} max={ora.getFullYear()} defaultValue={anno} className="btn" style={{ width: 90 }} /></label>
          <button className="btn primary" type="submit">Mostra</button>
        </form>
        <form action={controllaMese} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <input type="hidden" name="anno" value={anno} /><input type="hidden" name="mese" value={mese} />
          <button className="btn" type="submit">Controlla {MESI[mese - 1]} {anno} ora</button>
          <span style={muto}>{maiControllato ? "Mese non ancora controllato, oppure senza segnalazioni." : `Ultimo controllo: ${stato.ultimo ? new Date(stato.ultimo).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}`}</span>
        </form>
        {!righe.length && <p style={muto}>{maiControllato ? "Nessun dato salvato per" : "Nessuna segnalazione aperta per"} {MESI[mese - 1]} {anno}.{maiControllato ? " Usa «Controlla ora» per leggere HUB e foglio assenze." : ""}</p>}
        {codici.map((c) => (
          <section key={c} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>{etichetta(c)} ({righe.filter((r) => r.codice === c).length})</h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Persona", "Giorni", "Ore"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
              <tbody>{righe.filter((r) => r.codice === c).map((r) => (
                <tr key={r.id}><td style={cella}>{r.nome}</td><td style={cella}>{gg(r.giorni as Giorno[])}</td><td style={cella}>{Number(r.oreTotali) || ""}</td></tr>
              ))}</tbody>
            </table>
          </section>
        ))}
      </main>
    </>
  );
}
