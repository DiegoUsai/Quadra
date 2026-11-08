import { and, asc, eq, sql } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { oreAnomalia, oreControllo } from "@/db/schema";
import { etichetta, type Giorno } from "@/lib/hub/controllo";
import Barra from "../Barra";
import { controllaMese } from "./azioni";
import BottoneControlla from "./BottoneControlla";

export const dynamic = "force-dynamic";
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const quando = (d: Date | string | null) => (d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—");

export default async function Ore({ searchParams }: { searchParams: Promise<{ anno?: string; mese?: string; esito?: string; errore?: string }> }) {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata())
    return (<><Barra corrente="/ore" /><main className="pagina"><h1>Ore rendicontate</h1><p className="nota">Questa pagina è riservata all&apos;amministratore: contiene dati personali.</p></main></>);
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
      <main className="pagina">
        <h1>Ore rendicontate e assenze</h1>
        <p className="sottotitolo">HUB contro Elenco Assenze, solo giorni già chiusi. Visibile solo all&apos;amministratore; su Slack vanno solo i conteggi.</p>
        {q.errore && <p role="alert" style={{ color: "var(--color-bad)", fontWeight: 600 }}>Controllo non riuscito: {q.errore}</p>}
        {q.esito && <p role="status" style={{ fontWeight: 600 }}>{q.esito}</p>}

        <section aria-label="Scelta del mese" className="riquadro">
          <form method="get" className="riga-campi">
            <label>Mese<select name="mese" defaultValue={mese} className="campo">{MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            <label>Anno<input name="anno" type="number" min={2024} max={ora.getFullYear()} defaultValue={anno} className="campo" style={{ width: 90 }} /></label>
            <button className="btn" type="submit">Mostra risultati salvati</button>
            <span className="muto">Immediato: legge solo quello che è già nel database, non interroga l&apos;HUB.</span>
          </form>
          <form action={controllaMese} className="riga-campi">
            <input type="hidden" name="anno" value={anno} /><input type="hidden" name="mese" value={mese} />
            <BottoneControlla etichetta={`Controlla ${nome} ora`} />
          </form>
          <p className="nota">«Controlla ora» legge HUB e foglio assenze e aggiorna i risultati (10-20 secondi). Il controllo automatico fa da solo solo il mese in corso e il precedente, ogni mattina.</p>
        </section>

        <h2>{nome}</h2>
        {!controllatoIl && <p>Questo mese <strong>non è mai stato controllato</strong>: non ci sono risultati salvati. Premi «Controlla {nome} ora» per leggere HUB e foglio assenze.</p>}
        {controllatoIl && !righe.length && <p>Controllato il {quando(controllatoIl)}: <strong>nessuna segnalazione aperta</strong>{ctrl ? `. Le ore tornano per tutte le ${ctrl.utentiHub} persone dell'HUB, tolte le eccezioni registrate` : ""}.</p>}
        {controllatoIl && righe.length > 0 && <p className="nota">Ultimo controllo: {quando(controllatoIl)} · {righe.length} segnalazioni aperte.</p>}
        {codici.map((c) => (
          <section key={c}>
            <h3>{etichetta(c)} ({righe.filter((r) => r.codice === c).length})</h3>
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
