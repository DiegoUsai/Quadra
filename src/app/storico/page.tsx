import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { modificaCella, runControllo, variazione } from "@/db/schema";
import Barra from "../Barra";

export const dynamic = "force-dynamic";

// Righe del foglio coperte da una cella o un intervallo A1 ("F6", "A6496:Y6496").
function righeDi(cella: string): [number, number] {
  const n = [...cella.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  return [n[0] ?? 0, n[n.length - 1] ?? 0];
}
const mostra = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const ora = (d: Date | null) => (d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—");

export default async function Storico() {
  const db = getDb();
  const [runs, vars, edit] = await Promise.all([
    db.select().from(runControllo).orderBy(desc(runControllo.id)).limit(15),
    db.select().from(variazione).orderBy(desc(variazione.id)).limit(60),
    db.select().from(modificaCella).orderBy(desc(modificaCella.id)).limit(300),
  ]);
  const cella: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13 };
  return (
    <>
    <Barra corrente="/storico" />
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 16, fontFamily: "var(--font-anthropic-sans)", color: "var(--color-fg)" }}>
      <h1 style={{ fontWeight: 400 }}>Import e storico</h1>
      <h2>Ultimi controlli</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Avviato", "Origine", "Esito", "Variazioni", "Errore"].map((h) => <th key={h} style={cella}>{h}</th>)}</tr></thead>
        <tbody>{runs.map((r) => (
          <tr key={r.id}><td style={cella}>{ora(r.avviatoIl)}</td><td style={cella}>{r.origine}</td><td style={cella}>{r.esito}</td>
            <td style={cella}>{r.nVariazioni ?? 0}</td><td style={cella}>{r.errore ?? ""}</td></tr>
        ))}</tbody>
      </table>
      <h2>Ultime differenze</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Foglio", "Voce", "Tipo", "Campo", "Prima", "Dopo", "Chi (Apps Script)"].map((h) => <th key={h} style={cella}>{h}</th>)}</tr></thead>
        <tbody>{vars.flatMap((v) => {
          const campi = (v.campi as { campo: string; prima: unknown; dopo: unknown }[] | null) ?? [{ campo: "", prima: null, dopo: null }];
          const chi = edit.find((e) => e.foglio === v.foglio && v.rigaFoglio != null && righeDi(e.cella)[0] <= v.rigaFoglio && v.rigaFoglio <= righeDi(e.cella)[1]);
          return campi.map((c, i) => (
            <tr key={`${v.id}-${i}`}><td style={cella}>{v.foglio}</td><td style={cella}>{v.chiave}</td><td style={cella}>{v.tipo}</td>
              <td style={cella}>{c.campo}</td><td style={cella}>{mostra(c.prima)}</td><td style={cella}>{mostra(c.dopo)}</td>
              <td style={cella}>{chi ? `${chi.utente ?? "?"} · ${chi.cella}${chi.vecchioValore != null ? ` · era "${chi.vecchioValore}"` : ""}` : "—"}</td></tr>
          ));
        })}</tbody>
      </table>
      {vars.length === 0 && <p style={{ color: "var(--color-fg-muted)" }}>Nessuna differenza registrata.</p>}
    </main>
  </>
  );
}
