import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { modificaCella, runControllo, snapshotScadenzario, variazione } from "@/db/schema";
import Barra from "../Barra";

export const dynamic = "force-dynamic";

// Righe del foglio coperte da una cella o un intervallo A1 ("F6", "A6496:Y6496").
function righeDi(cella: string): [number, number] {
  const n = [...cella.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  return [n[0] ?? 0, n[n.length - 1] ?? 0];
}
const mostra = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const ora = (d: Date | null) => (d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—");
// Giorno (ora di Roma) di una colonna timestamp, per confrontarlo con le date dei filtri.
const giorno = (col: unknown) => sql`(${col} at time zone 'Europe/Rome')::date`;

type Filtri = { dal?: string; al?: string; foglio?: string; tipo?: string; q?: string; esito?: string; origine?: string; righe?: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PASSO = 100;

export default async function Storico({ searchParams }: { searchParams: Promise<Filtri> }) {
  const f = await searchParams;
  const dal = f.dal && ISO.test(f.dal) ? f.dal : undefined, al = f.al && ISO.test(f.al) ? f.al : undefined;
  const limite = Math.min(Math.max(Number(f.righe) || PASSO, PASSO), 1000);
  const db = getDb();

  // Controlli: dal più recente; filtri su periodo, esito e origine.
  const condRun = [
    dal ? sql`${giorno(runControllo.avviatoIl)} >= ${dal}::date` : undefined,
    al ? sql`${giorno(runControllo.avviatoIl)} <= ${al}::date` : undefined,
    f.esito ? eq(runControllo.esito, f.esito) : undefined,
    f.origine ? eq(runControllo.origine, f.origine) : undefined,
  ].filter(Boolean);
  // Differenze: dalla lettura più recente (data e ora della lettura dello scadenzario), poi per id.
  const q = f.q?.trim();
  const condVar = [
    dal ? sql`${giorno(snapshotScadenzario.lettoIl)} >= ${dal}::date` : undefined,
    al ? sql`${giorno(snapshotScadenzario.lettoIl)} <= ${al}::date` : undefined,
    f.foglio ? eq(variazione.foglio, f.foglio) : undefined,
    f.tipo ? eq(variazione.tipo, f.tipo) : undefined,
    q ? or(ilike(variazione.chiave, `%${q}%`), sql`${variazione.campi}::text ilike ${"%" + q + "%"}`) : undefined,
  ].filter(Boolean);

  const [runs, vars, fogli, esiti, origini] = await Promise.all([
    db.select().from(runControllo).where(and(...condRun)).orderBy(desc(runControllo.avviatoIl), desc(runControllo.id)).limit(limite),
    db.select({ v: variazione, lettoIl: snapshotScadenzario.lettoIl }).from(variazione).innerJoin(snapshotScadenzario, eq(variazione.snapshotId, snapshotScadenzario.id))
      .where(and(...condVar)).orderBy(desc(snapshotScadenzario.lettoIl), desc(variazione.id)).limit(limite),
    db.selectDistinct({ x: variazione.foglio }).from(variazione),
    db.selectDistinct({ x: runControllo.esito }).from(runControllo),
    db.selectDistinct({ x: runControllo.origine }).from(runControllo),
  ]);
  // Chi ha modificato: ultima modifica Apps Script su quella riga NON successiva alla lettura che ha visto la differenza.
  const fogliVar = [...new Set(vars.map((x) => x.v.foglio))];
  const edit = fogliVar.length ? await db.select().from(modificaCella).where(inArray(modificaCella.foglio, fogliVar)).orderBy(desc(modificaCella.ricevutaIl)).limit(2000) : [];
  const chiDi = (foglio: string, riga: number | null, lettoIl: Date) =>
    riga == null ? undefined : edit.find((e) => e.foglio === foglio && righeDi(e.cella)[0] <= riga && riga <= righeDi(e.cella)[1] && (e.quando ?? e.ricevutaIl) <= lettoIl);

  const cella: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13 };
  const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };
  const filtriAttivi = Boolean(dal || al || f.foglio || f.tipo || q || f.esito || f.origine);
  const altri = (() => { const p = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "righe") as [string, string][]); p.set("righe", String(limite + PASSO)); return `?${p}`; })();
  const opzioni = (xs: { x: string }[]) => xs.map((o) => o.x).sort().map((x) => <option key={x} value={x}>{x}</option>);

  return (
    <>
    <Barra corrente="/storico" />
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 16, fontFamily: "var(--font-anthropic-sans)", color: "var(--color-fg)" }}>
      <h1 style={{ fontWeight: 400 }}>Import e storico</h1>
      <p style={{ ...muto, marginTop: 0 }}>Dal più recente al più vecchio. Le date sono quelle della lettura dello scadenzario (ora di Roma).</p>
      <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", margin: "12px 0" }}>
        <label>Dal<br /><input type="date" name="dal" defaultValue={dal} className="btn" /></label>
        <label>Al<br /><input type="date" name="al" defaultValue={al} className="btn" /></label>
        <label>Foglio<br /><select name="foglio" defaultValue={f.foglio ?? ""} className="btn"><option value="">Tutti</option>{opzioni(fogli)}</select></label>
        <label>Tipo di differenza<br /><select name="tipo" defaultValue={f.tipo ?? ""} className="btn"><option value="">Tutti</option>{["nuova", "modificata", "eliminata"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>Cerca (voce o campo)<br /><input name="q" defaultValue={q} className="btn" placeholder="es. SardegnaCAT" /></label>
        <label>Esito controllo<br /><select name="esito" defaultValue={f.esito ?? ""} className="btn"><option value="">Tutti</option>{opzioni(esiti)}</select></label>
        <label>Origine<br /><select name="origine" defaultValue={f.origine ?? ""} className="btn"><option value="">Tutte</option>{opzioni(origini)}</select></label>
        <button type="submit" className="btn primary">Filtra</button>
        {filtriAttivi && <a href="/storico" className="btn">Azzera</a>}
      </form>

      <h2>Controlli ({runs.length}{runs.length === limite ? "+" : ""})</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Avviato", "Origine", "Esito", "Variazioni", "Errore"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
        <tbody>{runs.map((r) => (
          <tr key={r.id}><td style={cella}>{ora(r.avviatoIl)}</td><td style={cella}>{r.origine}</td><td style={cella}>{r.esito}</td>
            <td style={cella}>{r.nVariazioni ?? 0}</td><td style={cella}>{r.errore ?? ""}</td></tr>
        ))}</tbody>
      </table>
      {runs.length === 0 && <p style={muto}>Nessun controllo con questi filtri.</p>}

      <h2>Differenze ({vars.length}{vars.length === limite ? "+" : ""})</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Letto il", "Foglio", "Voce", "Tipo", "Campo", "Prima", "Dopo", "Chi (Apps Script)"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
        <tbody>{vars.flatMap(({ v, lettoIl }) => {
          const campi = (v.campi as { campo: string; prima: unknown; dopo: unknown }[] | null) ?? [{ campo: "", prima: null, dopo: null }];
          const chi = chiDi(v.foglio, v.rigaFoglio, lettoIl);
          return campi.map((c, i) => (
            <tr key={`${v.id}-${i}`}><td style={{ ...cella, whiteSpace: "nowrap" }}>{i === 0 ? ora(lettoIl) : ""}</td><td style={cella}>{v.foglio}</td><td style={cella}>{v.chiave}</td><td style={cella}>{v.tipo}</td>
              <td style={cella}>{c.campo}</td><td style={cella}>{mostra(c.prima)}</td><td style={cella}>{mostra(c.dopo)}</td>
              <td style={cella}>{chi ? `${chi.utente ?? "?"} · ${chi.cella}${chi.vecchioValore != null ? ` · era "${chi.vecchioValore}"` : ""}` : "—"}</td></tr>
          ));
        })}</tbody>
      </table>
      {vars.length === 0 && <p style={muto}>{filtriAttivi ? "Nessuna differenza con questi filtri." : "Nessuna differenza registrata."}</p>}
      {(runs.length === limite || vars.length === limite) && limite < 1000 && <p><a href={altri} className="btn">Mostra altre {PASSO} righe</a></p>}
    </main>
  </>
  );
}
