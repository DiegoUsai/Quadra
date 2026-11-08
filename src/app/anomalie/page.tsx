import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalia } from "@/db/schema";
import { auth, authSaltata } from "@/auth";
import { REGOLE } from "@/lib/regole/indice";
import { rimedioDi } from "@/lib/regole/rimedi";
import { gidFogli } from "@/lib/scadenzario/google";
import Barra from "../Barra";
import { prendiInCarico, riconosci, risolvi } from "./azioni";

export const dynamic = "force-dynamic";

const SEVERITA = ["bloccante", "alta", "media", "info"] as const;
const STATI = ["aperta", "in_carico", "riaperta", "riconosciuta", "risolta"] as const;
const ETICHETTA: Record<string, string> = { bloccante: "Bloccante", alta: "Alta", media: "Media", info: "Info", in_carico: "In carico", riconosciuta: "Riconosciuta", da_trattare: "Da trattare" };
const nome = (v: string) => ETICHETTA[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
const REGOLA = new Map(REGOLE.map((r) => [r.codice, r]));
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

type Filtri = { severita?: string; regola?: string; stato?: string; pm?: string; q?: string };
type Riga = typeof anomalia.$inferSelect;

// Dove si trova l'anomalia, in parole: contratto o progetto, e mese se c'è.
function dove(a: Riga): { principale: string; dettaglio: string } {
  const v = (a.valoriJson ?? {}) as Record<string, unknown>;
  const mese = a.periodoMese ? `${MESI[a.periodoMese - 1]} ${a.periodoAnno}` : a.periodoAnno ? String(a.periodoAnno) : "";
  if (a.entitaTipo === "movimento") return { principale: String(v.contratto ?? a.entitaChiave.split("|")[1] ?? a.entitaChiave), dettaglio: ["riga di Costi/Ricavi", mese].filter(Boolean).join(" · ") };
  if (a.entitaChiave.includes("|")) { const [p, anno] = a.entitaChiave.split("|"); return { principale: `Progetto ${p}`, dettaglio: anno }; }
  if (a.regola.startsWith("D0") && a.regola !== "D05") return { principale: `Progetto ${a.entitaChiave}`, dettaglio: mese };
  return { principale: a.entitaChiave.replace(/#\d+$/, ""), dettaglio: mese };
}

export default async function Anomalie({ searchParams }: { searchParams: Promise<Filtri> }) {
  const f = await searchParams;
  const s = await auth();
  const puoAgire = ["admin", "editor"].includes(s?.user?.ruolo ?? "") || authSaltata();
  const db = getDb();
  // Per impostazione predefinita si vedono le anomalie da trattare: le risolte si cercano con il filtro di stato.
  const stato = f.stato ?? "da_trattare";
  const dovrei: SQL[] = [];
  if (stato === "da_trattare") dovrei.push(sql`${anomalia.stato} in ('aperta','in_carico','riaperta')`);
  else if (stato !== "tutte") dovrei.push(eq(anomalia.stato, stato));
  if (f.severita) dovrei.push(eq(anomalia.severita, f.severita));
  if (f.regola) dovrei.push(f.regola.length === 1 ? sql`${anomalia.regola} like ${f.regola + "%"}` : eq(anomalia.regola, f.regola));
  if (f.pm) dovrei.push(eq(anomalia.pm, f.pm));
  if (f.q) dovrei.push(or(ilike(anomalia.entitaChiave, `%${f.q}%`), ilike(anomalia.messaggio, `%${f.q}%`))!);

  const idFoglio = process.env.SCADENZARIO_SPREADSHEET_ID;
  const [righe, conteggi, pm, gid] = await Promise.all([
    db.select().from(anomalia).where(and(...dovrei)).orderBy(sql`case ${anomalia.severita} when 'bloccante' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`, desc(anomalia.id)).limit(200),
    db.select({ severita: anomalia.severita, n: sql<number>`count(*)::int` }).from(anomalia).where(sql`${anomalia.stato} in ('aperta','in_carico','riaperta')`).groupBy(anomalia.severita),
    db.selectDistinct({ pm: anomalia.pm }).from(anomalia).orderBy(anomalia.pm),
    idFoglio ? gidFogli(idFoglio).catch(() => null) : Promise.resolve(null),
  ]);
  const n = (sev: string) => conteggi.find((c) => c.severita === sev)?.n ?? 0;
  const href = (p: Partial<Filtri>) => "/anomalie?" + new URLSearchParams(Object.entries({ ...f, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  // Link che apre il foglio sulla riga dell'anomalia, già selezionata.
  const linkFoglio = (a: Riga) => idFoglio && gid && a.foglio && a.rigaFoglio && gid[a.foglio] !== undefined
    ? `https://docs.google.com/spreadsheets/d/${idFoglio}/edit#gid=${gid[a.foglio]}&range=${a.rigaFoglio}:${a.rigaFoglio}` : null;
  const cella: React.CSSProperties = { padding: "8px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
  const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };

  return (
    <>
      <Barra corrente="/anomalie" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontFamily: "var(--font-anthropic-serif)", fontWeight: 700, marginBottom: 4 }}>Anomalie</h1>
        <p style={{ ...muto, marginTop: 0 }}>
          Da trattare: {SEVERITA.map((v) => `${n(v)} ${nome(v).toLowerCase()}`).join(" · ")}. La correzione si fa sul foglio: «Apri nel foglio» porta alla riga.
        </p>

        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", margin: "12px 0" }}>
          <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Severità
            <select name="severita" defaultValue={f.severita ?? ""} className="btn"><option value="">Tutte</option>
              {SEVERITA.map((v) => <option key={v} value={v}>{nome(v)}</option>)}</select></label>
          <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Stato
            <select name="stato" defaultValue={stato} className="btn">
              {["da_trattare", ...STATI, "tutte"].map((v) => <option key={v} value={v}>{nome(v)}</option>)}</select></label>
          <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Tipo di anomalia
            <select name="regola" defaultValue={f.regola ?? ""} className="btn" style={{ maxWidth: 280 }}><option value="">Tutte</option>
              {["A", "B", "C", "D"].map((g) => <option key={g} value={g}>Tutto il gruppo {g}</option>)}
              {REGOLE.map((r) => <option key={r.codice} value={r.codice}>{r.nome} ({r.codice})</option>)}</select></label>
          <label style={{ fontSize: 12, display: "grid", gap: 2 }}>PM
            <select name="pm" defaultValue={f.pm ?? ""} className="btn"><option value="">Tutti</option>
              {pm.filter((x) => x.pm).map((x) => <option key={x.pm} value={x.pm!}>{x.pm}</option>)}</select></label>
          <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Cerca contratto
            <input name="q" defaultValue={f.q ?? ""} className="btn" style={{ minWidth: 180 }} /></label>
          <button type="submit" className="btn primary">Filtra</button>
          <a href="/anomalie" className="btn">Azzera</a>
        </form>

        <p style={{ fontSize: 12, ...muto }}>
          {righe.length === 200 ? "Mostrate le prime 200 per severità. " : `${righe.length} anomalie. `}
          <a href={href({ stato: "da_trattare" })}>da trattare</a> · <a href={href({ stato: "riconosciuta" })}>riconosciute</a> · <a href={href({ stato: "risolta" })}>risolte</a>
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["Severità", "Anomalia e come risolverla", "Dove", "Stato", "Azioni"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
            <tbody>{righe.map((a) => {
              const r = REGOLA.get(a.regola), d = dove(a), link = linkFoglio(a), rimedio = rimedioDi(a.regola);
              return (
                <tr key={a.id}>
                  <td style={cella}><strong>{nome(a.severita)}</strong></td>
                  <td style={{ ...cella, maxWidth: 440 }}>
                    <strong title={r?.descrizione}>{r?.nome ?? a.regola}</strong> <span style={muto}>({a.regola})</span>
                    <div>{a.messaggio}</div>
                    {rimedio && <div style={{ ...muto, marginTop: 4 }}><strong style={{ color: "var(--color-fg)" }}>Come risolvere: </strong>{rimedio}</div>}
                  </td>
                  <td style={cella}>
                    <div><strong>{d.principale}</strong></div>
                    {d.dettaglio && <div style={muto}>{d.dettaglio}</div>}
                    {a.pm && <div style={muto}>PM {a.pm}</div>}
                    {link
                      ? <a href={link} target="_blank" rel="noopener noreferrer" className="btn" style={{ display: "inline-block", marginTop: 6 }}>Apri nel foglio ↗{a.rigaFoglio ? ` (riga ${a.rigaFoglio})` : ""}</a>
                      : <div style={muto}>{a.foglio ?? ""}{a.rigaFoglio ? `, riga ${a.rigaFoglio}` : ""}</div>}
                  </td>
                  <td style={cella}>{nome(a.stato)}{a.assegnataA ? <div style={muto}>{a.assegnataA}</div> : null}</td>
                  <td style={cella}>
                    {puoAgire && !["risolta", "riconosciuta"].includes(a.stato) ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        {a.stato !== "in_carico" && <form action={prendiInCarico}><input type="hidden" name="id" value={a.id} /><button className="btn" type="submit">Prendi in carico</button></form>}
                        <details><summary className="btn" style={{ display: "inline-block" }}>Risolvi</summary>
                          <form action={risolvi} style={{ display: "grid", gap: 4, marginTop: 4 }}><input type="hidden" name="id" value={a.id} />
                            <input name="nota" required placeholder="Nota di risoluzione" className="btn" /><button className="btn primary" type="submit">Conferma</button></form></details>
                        <details><summary className="btn" style={{ display: "inline-block" }}>Riconosci</summary>
                          <form action={riconosci} style={{ display: "grid", gap: 4, marginTop: 4 }}><input type="hidden" name="id" value={a.id} />
                            <input name="motivo" required placeholder="Motivo" className="btn" />
                            <label style={{ fontSize: 12 }}>Valida fino al <input type="date" name="fino" className="btn" /></label>
                            <button className="btn primary" type="submit">Conferma</button></form></details>
                      </div>
                    ) : <span style={muto}>—</span>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {righe.length === 0 && <p style={muto}>Nessuna anomalia con questi filtri.</p>}
      </main>
    </>
  );
}
