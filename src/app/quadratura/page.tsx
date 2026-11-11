import { eq, sql } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { cgdProgetto, rigaCorrente } from "@/db/schema";
import { confronta, eur, type Riga } from "@/lib/cgd/confronto";
import type { Dati } from "@/lib/regole/tipi";
import Barra from "../Barra";
import BottoneControlla from "../ore/BottoneControlla";
import { aggiornaDaHub } from "./azioni";
import "../anomalie/anomalie.css";

export const dynamic = "force-dynamic";
const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };
const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

// Confronto tra scadenzario e HUB (CGD) contratto per contratto, agganciati sul numero CTR. Le differenze diventano anomalie G.
export default async function Quadratura({ searchParams }: { searchParams: Promise<{ vista?: string; esito?: string; errore?: string }> }) {
  const q = await searchParams;
  const s = await auth();
  const admin = s?.user?.ruolo === "admin" || authSaltata();
  const db = getDb();
  const [righeDb, progettiDb, [ultima]] = await Promise.all([
    db.select().from(rigaCorrente).where(eq(rigaCorrente.foglio, "Contratti Attivi")),
    db.select().from(cgdProgetto),
    db.select({ quando: sql<Date | null>`max(${cgdProgetto.lettoIl})` }).from(cgdProgetto),
  ]);
  const contratti = righeDb.map((r) => ({ chiave: r.chiave, rigaFoglio: r.rigaFoglio, d: r.dati as Dati }));
  const progetti = progettiDb.map((p) => ({ id: p.id, nome: p.nome, ctr: p.ctr, importo: p.importo === null ? null : Number(p.importo), inizio: p.inizio, fine: p.fine, bloccato: p.bloccato }));
  const c = confronta(contratti, progetti);
  const agganciati = c.righe.filter((r) => r.hub), conDiff = agganciati.filter((r) => r.diff.importo || r.diff.inizio || r.diff.fine);
  const senzaHub = c.righe.length - agganciati.length;
  const tutti = q.vista === "tutti";
  const mostra: Riga[] = tutti ? agganciati : conDiff;
  const diff = (b: boolean): React.CSSProperties => (b ? { fontWeight: 700, background: "var(--color-panel)" } : {});

  return (
    <>
      <Barra corrente="/quadratura" />
      <main className="pagina">
        <h1>Quadratura HUB</h1>
        <p className="sottotitolo">Contratti dello scadenzario confrontati con i progetti dell&apos;HUB, agganciati sul codice CTR. Le differenze compaiono anche tra le <a href="/anomalie?regola=G">Anomalie</a> (gruppo G). Costi e ricavi mese per mese arriveranno dopo.</p>
        {q.errore && <p role="alert" style={{ color: "var(--color-danger, #b3261e)", fontWeight: 600 }}>Lettura non riuscita: {q.errore}</p>}
        {q.esito && <p role="status" style={{ fontWeight: 600 }}>{q.esito}</p>}

        {admin && (
          <form action={aggiornaDaHub} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "0 0 4px" }}>
            <BottoneControlla etichetta="Aggiorna dall'HUB ora" attesa="Sto leggendo i progetti dall'HUB e ricalcolo le anomalie: servono 10-20 secondi, la pagina si aggiorna da sola con l'esito." />
            <span style={muto}>{ultima?.quando ? `Ultima lettura: ${new Date(ultima.quando).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}` : "L'HUB non è ancora stato letto."}</span>
          </form>
        )}
        <p style={{ ...muto, margin: "0 0 16px" }}>La lettura automatica gira ogni mattina. L&apos;elenco mostra i progetti visibili all&apos;utente del token dell&apos;HUB: i contratti dello scadenzario che non compaiono qui possono semplicemente non essere visibili.</p>

        {!progetti.length ? <p>Nessun dato dall&apos;HUB: {admin ? "premi «Aggiorna dall'HUB ora»." : "chiedi all'amministratore di leggere l'HUB."}</p> : (<>
          <div className="conteggi" role="group" aria-label="Esito del confronto">
            <div><span className="n">{progetti.length}</span><span className="et">progetti HUB letti</span></div>
            <div><span className="n">{agganciati.length}</span><span className="et">contratti agganciati</span></div>
            <div><span className="n">{agganciati.length - conDiff.length}</span><span className="et">coincidono</span></div>
            <div><span className="n">{conDiff.length}</span><span className="et">con differenze</span></div>
            <div><span className="n">{c.soloHub.length}</span><span className="et">solo sull&apos;HUB</span></div>
            <div><span className="n">{senzaHub}</span><span className="et">con CTR non visibile sull&apos;HUB</span></div>
          </div>

          <h2 style={{ fontSize: 18, margin: "20px 0 4px" }}>Contratti agganciati</h2>
          <p style={{ margin: "0 0 8px" }}>
            <a href="/quadratura" aria-current={!tutti ? "true" : undefined} style={{ fontWeight: !tutti ? 700 : 400 }}>Solo con differenze ({conDiff.length})</a>{" · "}
            <a href="/quadratura?vista=tutti" aria-current={tutti ? "true" : undefined} style={{ fontWeight: tutti ? 700 : 400 }}>Tutti ({agganciati.length})</a>
          </p>
          {!mostra.length ? <p style={muto}>Nessun contratto con differenze: scadenzario e HUB coincidono sui contratti agganciati.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["CTR", "Contratto (Id)", "PM", "Importo scadenzario", "Importo HUB", "Inizio scadenzario", "Inizio HUB", "Fine scadenzario", "Fine HUB"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
                <tbody>{mostra.map((r) => (
                  <tr key={r.ctr}>
                    <td style={cella}>CTR{r.ctr}</td><td style={cella}>{r.contratti.join(", ")}{r.contratti.length > 1 ? <div style={muto}>somma di {r.contratti.length} Id Contratto</div> : null}</td><td style={cella}>{r.pm ?? "—"}</td>
                    <td style={{ ...cella, ...diff(r.diff.importo) }}>{eur(r.importo)}</td><td style={{ ...cella, ...diff(r.diff.importo) }}>{eur(r.hub!.importo)}</td>
                    <td style={{ ...cella, ...diff(r.diff.inizio) }}>{data(r.inizio)}</td><td style={{ ...cella, ...diff(r.diff.inizio) }}>{data(r.hub!.inizio)}</td>
                    <td style={{ ...cella, ...diff(r.diff.fine) }}>{data(r.fine)}</td><td style={{ ...cella, ...diff(r.diff.fine) }}>{data(r.hub!.fine)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {c.soloHub.length > 0 && (<>
            <h2 style={{ fontSize: 18, margin: "24px 0 4px" }}>Solo sull&apos;HUB ({c.soloHub.length})</h2>
            <p style={{ ...muto, margin: "0 0 8px" }}>Progetti con codice CTR che nessun contratto dello scadenzario ha nella colonna CTR HUB.</p>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["CTR", "Progetto HUB", "Importo", "Inizio", "Fine"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
              <tbody>{c.soloHub.map((h) => <tr key={h.ctr}><td style={cella}>CTR{h.ctr}</td><td style={cella}>{h.nome}{h.bloccato ? <span style={muto}> (bloccato)</span> : null}</td><td style={cella}>{eur(h.importo)}</td><td style={cella}>{data(h.inizio)}</td><td style={cella}>{data(h.fine)}</td></tr>)}</tbody>
            </table>
          </>)}

          {c.senzaCtr.length > 0 && <p style={{ ...muto, marginTop: 20 }}>{c.senzaCtr.length} progetti dell&apos;HUB non hanno il codice CTR e non si possono agganciare.</p>}
        </>)}
      </main>
    </>
  );
}
