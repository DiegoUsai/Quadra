import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalia, regola } from "@/db/schema";
import { auth, authSaltata } from "@/auth";
import Barra from "../Barra";
import { prendiInCarico, riconosci, risolvi } from "./azioni";

export const dynamic = "force-dynamic";

const SEVERITA = ["bloccante", "alta", "media", "info"] as const;
const STATI = ["aperta", "in_carico", "riaperta", "riconosciuta", "risolta"] as const;
const ETICHETTA: Record<string, string> = { bloccante: "Bloccante", alta: "Alta", media: "Media", info: "Info", in_carico: "In carico", riconosciuta: "Riconosciuta" };
const nome = (v: string) => ETICHETTA[v] ?? v.charAt(0).toUpperCase() + v.slice(1);

type Filtri = { severita?: string; gruppo?: string; stato?: string; pm?: string; q?: string };

export default async function Anomalie({ searchParams }: { searchParams: Promise<Filtri> }) {
  const f = await searchParams;
  const s = await auth();
  const puoAgire = ["admin", "editor"].includes(s?.user?.ruolo ?? "") || authSaltata();
  const db = getDb();
  // Per impostazione predefinita si vedono le anomalie da trattare: le risolte si cercano con il filtro di stato.
  const stato = f.stato ?? "da_trattare";
  const dove: SQL[] = [];
  if (stato === "da_trattare") dove.push(sql`${anomalia.stato} in ('aperta','in_carico','riaperta')`);
  else if (stato !== "tutte") dove.push(eq(anomalia.stato, stato));
  if (f.severita) dove.push(eq(anomalia.severita, f.severita));
  if (f.gruppo) dove.push(sql`${anomalia.regola} like ${f.gruppo + "%"}`);
  if (f.pm) dove.push(eq(anomalia.pm, f.pm));
  if (f.q) dove.push(or(ilike(anomalia.entitaChiave, `%${f.q}%`), ilike(anomalia.messaggio, `%${f.q}%`))!);

  const [righe, conteggi, pm, regole] = await Promise.all([
    db.select().from(anomalia).where(and(...dove)).orderBy(sql`case ${anomalia.severita} when 'bloccante' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`, desc(anomalia.id)).limit(200),
    db.select({ severita: anomalia.severita, n: sql<number>`count(*)::int` }).from(anomalia).where(sql`${anomalia.stato} in ('aperta','in_carico','riaperta')`).groupBy(anomalia.severita),
    db.selectDistinct({ pm: anomalia.pm }).from(anomalia).orderBy(anomalia.pm),
    db.select().from(regola),
  ]);
  const nomeRegola = new Map(regole.map((r) => [r.codice, r.nome]));
  const n = (sev: string) => conteggi.find((c) => c.severita === sev)?.n ?? 0;
  const href = (p: Partial<Filtri>) => "/anomalie?" + new URLSearchParams(Object.entries({ ...f, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };

  return (
    <>
    <Barra corrente="/anomalie" />
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontFamily: "var(--font-anthropic-serif)", fontWeight: 700, marginBottom: 4 }}>Anomalie</h1>
      <p style={{ color: "var(--color-fg-muted)", marginTop: 0 }}>
        Da trattare: {SEVERITA.map((v) => `${n(v)} ${nome(v).toLowerCase()}`).join(" · ")}. Le regole sono dati con soglie modificabili; la correzione si fa sulla fonte.
      </p>

      <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", margin: "12px 0" }}>
        {([["severita", "Severità", SEVERITA, f.severita], ["stato", "Stato", ["da_trattare", ...STATI, "tutte"], stato]] as const).map(([k, et, vals, cur]) => (
          <label key={k} style={{ fontSize: 12, display: "grid", gap: 2 }}>{et}
            <select name={k} defaultValue={cur ?? ""} className="btn">{k === "severita" && <option value="">Tutte</option>}
              {vals.map((v) => <option key={v} value={v}>{nome(v === "da_trattare" ? "Da trattare" : v)}</option>)}</select></label>
        ))}
        <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Gruppo
          <select name="gruppo" defaultValue={f.gruppo ?? ""} className="btn"><option value="">Tutti</option>
            {["A", "B", "C", "D"].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label style={{ fontSize: 12, display: "grid", gap: 2 }}>PM
          <select name="pm" defaultValue={f.pm ?? ""} className="btn"><option value="">Tutti</option>
            {pm.filter((x) => x.pm).map((x) => <option key={x.pm} value={x.pm!}>{x.pm}</option>)}</select></label>
        <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Cerca contratto
          <input name="q" defaultValue={f.q ?? ""} className="btn" style={{ minWidth: 180 }} /></label>
        <button type="submit" className="btn primary">Filtra</button>
        <a href="/anomalie" className="btn">Azzera</a>
      </form>

      <p style={{ fontSize: 12, color: "var(--color-fg-muted)" }}>
        {righe.length === 200 ? "Mostrate le prime 200 per severità. " : `${righe.length} anomalie. `}
        <a href={href({ stato: "da_trattare" })}>da trattare</a> · <a href={href({ stato: "riconosciuta" })}>riconosciute</a> · <a href={href({ stato: "risolta" })}>risolte</a>
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>{["Severità", "Regola", "Contratto", "Messaggio", "Stato", "PM", "Azioni"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
          <tbody>{righe.map((a) => (
            <tr key={a.id}>
              <td style={cella}><strong>{nome(a.severita)}</strong></td>
              <td style={cella} title={nomeRegola.get(a.regola)}>{a.regola}</td>
              <td style={cella}>{a.entitaChiave.split("|").slice(0, 2).join(" · ")}{a.rigaFoglio ? <span style={{ color: "var(--color-fg-muted)" }}> (riga {a.rigaFoglio})</span> : null}</td>
              <td style={cella}>{a.messaggio}</td>
              <td style={cella}>{nome(a.stato)}{a.assegnataA ? ` · ${a.assegnataA}` : ""}</td>
              <td style={cella}>{a.pm ?? "—"}</td>
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
                ) : <span style={{ color: "var(--color-fg-muted)" }}>—</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {righe.length === 0 && <p style={{ color: "var(--color-fg-muted)" }}>Nessuna anomalia con questi filtri.</p>}
    </main>
    </>
  );
}
