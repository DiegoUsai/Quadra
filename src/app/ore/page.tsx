import { and, asc, eq, sql } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { oreAnomalia, oreControllo } from "@/db/schema";
import { etichetta, type Giorno } from "@/lib/hub/controllo";
import Barra from "../Barra";
import { controllaMese } from "./azioni";
import BottoneControlla from "./BottoneControlla";

export const dynamic = "force-dynamic";
const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const quando = (d: Date | string | null) => (d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—");

export default async function Ore({ searchParams }: { searchParams: Promise<{ anno?: string; mese?: string; esito?: string; errore?: string }> }) {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata())
    return (<><Barra corrente="/ore" /><main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}><h1>Ore rendicontate</h1><p style={muto}>Questa pagina è riservata all&apos;amministratore: contiene dati personali.</p></main></>);
  const q = await searchParams;
  const ora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const anno = Number(q.anno) || ora.getFullYear(), mese = Number(q.mese) || ora.getMonth() + 1;
  const db = getDb();
  const [righe, [ctrl], [salvate]] = await Promise.all([
    db.select().from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese), eq(oreAnomalia.stato, "aperta"))).orderBy(asc(oreAnomalia.codice), asc(oreAnomalia.nome)),
    db.select().from(oreControllo).where(and(eq(oreControllo.anno, anno), eq(oreControllo.mese, mese))),
    db.select({ n: sql<number>`count(*)::int`, ultimo: sql<Date | null>`max(${oreAnomalia.ultimaVista})` }).from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese))),
  ]);
  // Controllato = c'è la registrazione dell'ultimo controllo, oppure (mesi controllati prima che esistesse) ci sono segnalazioni salvate.
  const controllatoIl = ctrl?.eseguitoIl ?? salvate.ultimo;
  const codici = [...new Set(righe.map((r) => r.codice))];
  const gg = (g: Giorno[]) => g.map((x) => `${x.g.slice(0, 2)}${x.ore ? ` (${x.ore} h)` : ""}`).join(", ");
  const nome = `${MESI[mese - 1]} ${anno}`;
  return (
    <>
      <Barra corrente="/ore" />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontFamily: "var(--font-anthropic-serif)", fontWeight: 700, marginBottom: 4 }}>Ore rendicontate e assenze</h1>
        <p style={{ ...muto, marginTop: 0 }}>HUB contro Elenco Assenze, solo giorni già chiusi. Visibile solo all&apos;amministratore; su Slack vanno solo i conteggi.</p>
        {q.errore && <p role="alert" style={{ color: "var(--color-danger, #b3261e)", fontWeight: 600 }}>Controllo non riuscito: {q.errore}</p>}
        {q.esito && <p role="status" style={{ fontWeight: 600 }}>{q.esito}</p>}

        <section aria-label="Scelta del mese" style={{ border: "1px solid var(--color-border-line)", borderRadius: 6, padding: 12, marginBottom: 16 }}>
          <form method="get" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label>Mese<br /><select name="mese" defaultValue={mese} className="btn">{MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            <label>Anno<br /><input name="anno" type="number" min={2024} max={ora.getFullYear()} defaultValue={anno} className="btn" style={{ width: 90 }} /></label>
            <button className="btn" type="submit">Mostra risultati salvati</button>
            <span style={muto}>Immediato: legge solo quello che è già nel database, non interroga l&apos;HUB.</span>
          </form>
          <form action={controllaMese} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <input type="hidden" name="anno" value={anno} /><input type="hidden" name="mese" value={mese} />
            <BottoneControlla etichetta={`Controlla ${nome} ora`} />
          </form>
          <p style={{ ...muto, margin: "8px 0 0" }}>«Controlla ora» legge HUB e foglio assenze e aggiorna i risultati (10-20 secondi). Il controllo automatico fa da solo solo il mese in corso e il precedente, ogni mattina.</p>
        </section>

        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{nome}</h2>
        {!controllatoIl && <p>Questo mese <strong>non è mai stato controllato</strong>: non ci sono risultati salvati. Premi «Controlla {nome} ora» per leggere HUB e foglio assenze.</p>}
        {controllatoIl && !righe.length && <p>Controllato il {quando(controllatoIl)}: <strong>nessuna segnalazione aperta</strong>{ctrl ? `. Le ore tornano per tutte le ${ctrl.utentiHub} persone dell'HUB, tolte le eccezioni registrate` : ""}.</p>}
        {controllatoIl && righe.length > 0 && <p style={muto}>Ultimo controllo: {quando(controllatoIl)} · {righe.length} segnalazioni aperte.</p>}
        {codici.map((c) => (
          <section key={c} style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>{etichetta(c)} ({righe.filter((r) => r.codice === c).length})</h3>
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
