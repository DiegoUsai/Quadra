import { and, asc, eq } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { oreAnomalia } from "@/db/schema";
import { etichetta, type Giorno } from "@/lib/hub/controllo";
import Barra from "../Barra";

export const dynamic = "force-dynamic";
const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };

export default async function Ore({ searchParams }: { searchParams: Promise<{ anno?: string; mese?: string }> }) {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata())
    return (<><Barra corrente="/ore" /><main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}><h1>Ore rendicontate</h1><p style={muto}>Questa pagina è riservata all&apos;amministratore: contiene dati personali.</p></main></>);
  const q = await searchParams;
  const ora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const anno = Number(q.anno) || ora.getFullYear(), mese = Number(q.mese) || ora.getMonth() + 1;
  const righe = await getDb().select().from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese), eq(oreAnomalia.stato, "aperta"))).orderBy(asc(oreAnomalia.codice), asc(oreAnomalia.nome));
  const codici = [...new Set(righe.map((r) => r.codice))];
  const gg = (g: Giorno[]) => g.map((x) => `${x.g.slice(0, 2)}${x.ore ? ` (${x.ore} h)` : ""}`).join(", ");
  return (
    <>
      <Barra corrente="/ore" />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontFamily: "var(--font-anthropic-serif)", fontWeight: 700, marginBottom: 4 }}>Ore rendicontate e assenze</h1>
        <p style={{ ...muto, marginTop: 0 }}>HUB contro Elenco Assenze, solo giorni già chiusi. Visibile solo all&apos;amministratore; su Slack vanno solo i conteggi.</p>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
          <label>Anno<br /><input name="anno" defaultValue={anno} className="btn" size={5} /></label>
          <label>Mese<br /><input name="mese" defaultValue={mese} className="btn" size={3} /></label>
          <button className="btn primary" type="submit">Mostra</button>
        </form>
        {!righe.length && <p style={muto}>Nessuna segnalazione aperta per {String(mese).padStart(2, "0")}/{anno}.</p>}
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
