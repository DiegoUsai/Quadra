import { auth, signOut, authSaltata } from "@/auth";

// Tre sezioni (decisione di Diego, 09/11/2026): Consuntivo (anomalie, ore, quadratura con l'HUB), Budget (le schede e il promemoria
// del residuo), Forecast (da definire). Regole resta fuori, solo per l'amministratore. Gli indirizzi delle pagine non cambiano.
type Pagina = readonly [href: string, etichetta: string, soloAdmin?: boolean];
const SEZIONI: readonly { id: string; etichetta: string; pagine: readonly Pagina[] }[] = [
  { id: "consuntivo", etichetta: "Consuntivo", pagine: [["/anomalie", "Anomalie"], ["/ore", "Ore e presenze", true], ["/quadratura", "Quadratura HUB"], ["/storico", "Import e storico"]] },
  { id: "budget", etichetta: "Budget", pagine: [["/schede", "Schede"], ["/budget/da-mettere", "Da mettere a budget"]] },
  { id: "forecast", etichetta: "Forecast", pagine: [["/forecast", "Forecast"]] },
];
const REGOLE = "/regole";

const link = (href: string, et: string, attivo: boolean, dimensione?: "piccolo") => (
  <a key={href} href={href} aria-current={attivo ? "page" : undefined}
    style={{ color: "var(--color-fg)", fontWeight: attivo ? 700 : 400, textDecoration: attivo ? "underline" : "none", textUnderlineOffset: 6, ...(dimensione ? { fontSize: "var(--cds-font-size-caption)" } : {}) }}>{et}</a>
);

// Barra comune: marchio, sezioni, utente con ruolo e uscita; sotto, le pagine della sezione corrente.
export default async function Barra({ corrente }: { corrente: string }) {
  const s = await auth();
  const admin = s?.user?.ruolo === "admin" || authSaltata();
  const sezione = SEZIONI.find((x) => x.pagine.some(([h]) => h === corrente));
  const pagine = (sezione?.pagine ?? []).filter(([, , soloAdmin]) => !soloAdmin || admin);
  return (
    <>
      <header className="topbar">
        <span className="marchio"><img src="/brand/quadra-mark.svg" alt="" width={30} height={30} />Quadra</span>
        <nav aria-label="Sezioni" style={{ display: "flex", gap: 14, flex: 1, marginLeft: 24 }}>
          {SEZIONI.map((x) => link(x.pagine[0][0], x.etichetta, x.id === sezione?.id))}
          {admin && link(REGOLE, "Regole", corrente === REGOLE)}
        </nav>
        <div className="utente">
          <span>{s?.user?.email ?? (authSaltata() ? "sviluppo locale, accesso disattivato" : "")}{s?.user?.ruolo ? ` · ${s.user.ruolo}` : ""}</span>
          {s && (
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <button type="submit" className="btn">Esci</button>
            </form>
          )}
        </div>
      </header>
      {pagine.length > 1 && (
        <nav aria-label={`Pagine di ${sezione?.etichetta}`} className="subnav">
          {pagine.map(([href, et]) => link(href, et, href === corrente, "piccolo"))}
        </nav>
      )}
    </>
  );
}
