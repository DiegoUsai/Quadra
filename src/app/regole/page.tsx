import { asc, eq, sql } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { correzione, eccezione, mappaUtente, oreEccezione, regola, rigaCorrente } from "@/db/schema";
import { TIPI_ORE } from "@/lib/hub/eccezioni";
import { REGOLE } from "@/lib/regole/indice";
import Barra from "../Barra";
import { aggiungiOreEccezione, eliminaEccezione, eliminaOreEccezione, salvaMappaPm, salvaRegola } from "./azioni";

export const dynamic = "force-dynamic";

const GRUPPI: Record<string, string> = { A: "Struttura e anagrafica", B: "Coerenza economica del contratto", C: "Canoni", D: "Budget e consuntivo", H: "Valori ammessi dal Lookup", K: "Righe di Costi/Ricavi" };
const SEV = ["bloccante", "alta", "media", "info"] as const;

export default async function Regole() {
  const s = await auth();
  const admin = s?.user?.ruolo === "admin" || authSaltata();
  if (!admin)
    return (<><Barra corrente="/regole" /><main className="pagina"><h1>Regole ed eccezioni</h1><p className="nota">Questa pagina è riservata all&apos;amministratore.</p></main></>);

  const db = getDb();
  const [righe, ecc, corr, pmNomi, pmSlack, oreEcc] = await Promise.all([
    db.select().from(regola), db.select().from(eccezione).orderBy(asc(eccezione.regola), asc(eccezione.entitaChiave)), db.select().from(correzione).orderBy(asc(correzione.entitaChiave)),
    db.selectDistinct({ pm: sql<string>`${rigaCorrente.dati}->>'pm'` }).from(rigaCorrente).where(sql`${rigaCorrente.foglio} = 'Contratti Attivi' and ${rigaCorrente.dati}->>'pm' is not null`),
    db.select().from(mappaUtente), db.select().from(oreEccezione).orderBy(asc(oreEccezione.tipo), asc(oreEccezione.nome)),
  ]);
  const slackDi = new Map(pmSlack.map((p) => [p.pmNome, p.slackUserId ?? ""]));
  const pmLista = [...new Set(pmNomi.map((p) => p.pm).filter(Boolean))].sort();
  const dbPer = new Map(righe.map((r) => [r.codice, r]));
  const gruppi = [...new Set(REGOLE.map((r) => r.gruppo))];

  return (
    <>
      <Barra corrente="/regole" />
      <main className="pagina">
        <h1>Regole ed eccezioni</h1>
        <p className="nota">Soglie, severità e attivazione sono dati: la modifica ricalcola subito le anomalie e viene registrata nell&apos;audit.</p>

        {gruppi.map((g) => (
          <section key={g}>
            <h2>Gruppo {g}: {GRUPPI[g]}</h2>
            <table>
              <thead><tr>{["Regola", "Severità", "Attiva", "Notifica", "Soglie", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
              <tbody>{REGOLE.filter((r) => r.gruppo === g).map((r) => {
                const d = dbPer.get(r.codice);
                const f = `f-${r.codice}`;
                return (
                  <tr key={r.codice}>
                    <td style={{ maxWidth: 380 }}><strong>{r.nome}</strong> <span className="muto">({r.codice})</span><div className="muto">{r.descrizione}</div></td>
                    <td><select form={f} name="severita" defaultValue={d?.severita ?? r.severita} className="campo">{SEV.map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                    <td><input form={f} type="checkbox" name="attiva" defaultChecked={d?.attiva ?? true} aria-label={`Regola ${r.codice} attiva`} /></td>
                    <td><input form={f} type="checkbox" name="notifica" defaultChecked={d?.notifica ?? r.notifica ?? true} aria-label={`Notifica ${r.codice}`} /></td>
                    <td>
                      {Object.keys(r.soglie).length
                        ? <textarea form={f} name="soglie" defaultValue={JSON.stringify(d?.sogliaJson ?? r.soglie, null, 1)} rows={Math.min(6, Object.keys(r.soglie).length + 2)} className="campo" style={{ fontFamily: "monospace", width: 260 }} aria-label={`Soglie ${r.codice}`} />
                        : <><input form={f} type="hidden" name="soglie" value="{}" /><span className="muto">nessuna soglia</span></>}
                    </td>
                    <td>
                      <form id={f} action={salvaRegola}><input type="hidden" name="codice" value={r.codice} /><button type="submit" className="btn">Salva</button></form>
                      {d && d.versione > 1 && <div className="muto">versione {d.versione}</div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </section>
        ))}

        <section>
          <h2>Eccezioni ({ecc.length})</h2>
          <p className="nota">Un&apos;eccezione scaduta riapre l&apos;anomalia. L&apos;asterisco finale vale come jolly (<code>C*</code> = tutto il gruppo C).</p>
          <div className="scorri">
            <table>
              <thead><tr>{["Regola", "Contratto o progetto", "Motivo", "Approvata da", "Dal", "Fino al", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
              <tbody>{ecc.map((e) => (
                <tr key={e.id}><td>{e.regola}</td><td>{e.entitaChiave}</td><td style={{ maxWidth: 380 }}>{e.motivo}</td><td>{e.approvataDa}</td>
                  <td>{e.validaDal}</td><td>{e.validaFino ?? "senza scadenza"}</td>
                  <td><form action={eliminaEccezione}><input type="hidden" name="id" value={e.id} /><button className="btn" type="submit">Elimina</button></form></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Correzioni ({corr.length})</h2>
          <p className="nota">Applicate in lettura, mai sul foglio. Una correzione attiva riconosce le anomalie dei canoni del contratto o del progetto.</p>
          <div className="scorri">
            <table>
              <thead><tr>{["Tipo", "Contratto o progetto", "Parametri", "Motivo", "Dal", "Attiva"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{corr.map((c) => (
                <tr key={c.id}><td>{c.tipo}</td><td>{c.entitaChiave}</td><td style={{ fontFamily: "monospace" }}>{JSON.stringify(c.parametriJson)}</td>
                  <td style={{ maxWidth: 380 }}>{c.motivo}</td><td>{c.validaDal}</td><td>{c.attiva ? "sì" : "no"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>PM e utenti Slack</h2>
          <p className="nota">Serve a menzionare il PM nelle notifiche. L&apos;ID si copia dal profilo Slack della persona (Copia ID membro) e ha la forma U0123ABCD. Senza ID il nome compare in chiaro.</p>
          <table>
            <thead><tr>{["PM (colonna PM dello scadenzario)", "ID utente Slack", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{pmLista.map((pm) => (
              <tr key={pm}><td>{pm}</td>
                <td><input form={`pm-${pm}`} name="slack" defaultValue={slackDi.get(pm) ?? ""} placeholder="U0123ABCD" className="campo" aria-label={`ID Slack di ${pm}`} /></td>
                <td><form id={`pm-${pm}`} action={salvaMappaPm}><input type="hidden" name="pm" value={pm} /><button className="btn" type="submit">Salva</button></form></td></tr>
            ))}</tbody>
          </table>
        </section>
        <section>
          <h2>Controllo ore: eccezioni ({oreEcc.length})</h2>
          <p className="nota">
            Il nome si scrive come sull&apos;HUB, in qualunque ordine. <strong>orario</strong>: part-time (ore al giorno e/o giorni liberi); <strong>presa servizio</strong>: primo giorno in servizio;
            <strong> nome escluso</strong>: aspettativa, altra BU o uscito; <strong>ferie su HUB</strong>: rendiconta le ferie anche sull&apos;HUB; <strong>remoto</strong>: il patrono non vale.
            Per nome escluso, ferie su HUB e remoto il periodo (dal, fino al) limita la validità: scaduta, l&apos;eccezione non si applica più.
          </p>
          <div className="scorri">
            <table>
              <thead><tr>{["Tipo", "Nome", "Parametri", "Motivo", "Approvata da", "Dal", "Fino al", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
              <tbody>{oreEcc.map((e) => (
                <tr key={e.id}><td>{e.tipo}</td><td>{e.nome}</td><td style={{ fontFamily: "monospace" }}>{Object.keys(e.parametriJson as object).length ? JSON.stringify(e.parametriJson) : ""}</td>
                  <td style={{ maxWidth: 320 }}>{e.motivo}</td><td>{e.approvataDa}</td><td>{e.validaDal ?? ""}</td><td>{e.validaFino ?? ""}</td>
                  <td><form action={eliminaOreEccezione}><input type="hidden" name="id" value={e.id} /><button className="btn" type="submit">Elimina</button></form></td></tr>
              ))}</tbody>
            </table>
          </div>
          <form action={aggiungiOreEccezione} className="riga-campi">
            <label>Tipo<select name="tipo" className="campo">{TIPI_ORE.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label>Nome<input name="nome" required className="campo" placeholder="Cognome Nome" /></label>
            <label>Ore al giorno<input name="oreGiorno" className="campo" placeholder="6" size={4} /></label>
            <label>Giorni liberi<input name="liberi" className="campo" placeholder="ven" size={8} /></label>
            <label>Dal<input name="dal" type="date" className="campo" /></label>
            <label>Fino al<input name="fino" type="date" className="campo" /></label>
            <label>Motivo<input name="motivo" required className="campo" size={36} /></label>
            <button type="submit" className="btn primary">Aggiungi</button>
          </form>
        </section>
      </main>
    </>
  );
}
