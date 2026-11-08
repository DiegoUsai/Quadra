import { and, asc, eq } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { oreAnomalia } from "@/db/schema";
import { etichetta, type Giorno } from "@/lib/hub/controllo";
import Barra from "../Barra";

export const dynamic = "force-dynamic";

export default async function Ore({ searchParams }: { searchParams: Promise<{ anno?: string; mese?: string }> }) {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata())
    return (<><Barra corrente="/ore" /><main className="pagina"><h1>Ore rendicontate</h1><p className="nota">Questa pagina è riservata all&apos;amministratore: contiene dati personali.</p></main></>);
  const q = await searchParams;
  const ora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const anno = Number(q.anno) || ora.getFullYear(), mese = Number(q.mese) || ora.getMonth() + 1;
  const righe = await getDb().select().from(oreAnomalia).where(and(eq(oreAnomalia.anno, anno), eq(oreAnomalia.mese, mese), eq(oreAnomalia.stato, "aperta"))).orderBy(asc(oreAnomalia.codice), asc(oreAnomalia.nome));
  const codici = [...new Set(righe.map((r) => r.codice))];
  const gg = (g: Giorno[]) => g.map((x) => `${x.g.slice(0, 2)}${x.ore ? ` (${x.ore} h)` : ""}`).join(", ");
  return (
    <>
      <Barra corrente="/ore" />
      <main className="pagina">
        <h1>Ore rendicontate e assenze</h1>
        <p className="sottotitolo">HUB contro Elenco Assenze, solo giorni già chiusi. Visibile solo all&apos;amministratore; su Slack vanno solo i conteggi.</p>
        <form method="get" className="riga-campi">
          <label>Anno<input name="anno" defaultValue={anno} className="campo" size={5} /></label>
          <label>Mese<input name="mese" defaultValue={mese} className="campo" size={3} /></label>
          <button className="btn primary" type="submit">Mostra</button>
        </form>
        {!righe.length && <p className="nota">Nessuna segnalazione aperta per {String(mese).padStart(2, "0")}/{anno}.</p>}
        {codici.map((c) => (
          <section key={c}>
            <h2>{etichetta(c)} ({righe.filter((r) => r.codice === c).length})</h2>
            <table>
              <thead><tr>{["Persona", "Giorni", "Ore"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{righe.filter((r) => r.codice === c).map((r) => (
                <tr key={r.id}><td>{r.nome}</td><td>{gg(r.giorni as Giorno[])}</td><td>{Number(r.oreTotali) || ""}</td></tr>
              ))}</tbody>
            </table>
          </section>
        ))}
      </main>
    </>
  );
}
