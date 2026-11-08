import { auth, signOut, authSaltata } from "@/auth";

const VOCI = [["/schede", "Schede"], ["/anomalie", "Anomalie"], ["/storico", "Import e storico"]] as const;
const VOCI_ADMIN = [["/ore", "Ore"], ["/regole", "Regole"]] as const; // solo amministratore

// Barra comune: marchio, navigazione, utente con ruolo e uscita.
export default async function Barra({ corrente }: { corrente: string }) {
  const s = await auth();
  return (
    <header className="topbar">
      <span className="marchio"><img src="/brand/quadra-mark.svg" alt="" width={30} height={30} />Quadra</span>
      <nav aria-label="Sezioni" style={{ display: "flex", gap: 14, flex: 1, marginLeft: 24 }}>
        {[...VOCI, ...(s?.user?.ruolo === "admin" || authSaltata() ? VOCI_ADMIN : [])].map(([href, et]) => (
          <a key={href} href={href} aria-current={href === corrente ? "page" : undefined}
            style={{ color: "var(--color-fg)", fontWeight: href === corrente ? 700 : 400, textDecoration: href === corrente ? "underline" : "none", textUnderlineOffset: 6 }}>{et}</a>
        ))}
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
  );
}
