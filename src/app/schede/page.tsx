import Schede from "@/schede/Schede";
import { auth, signOut, authSaltata } from "@/auth";

export default async function Page() {
  const s = await auth();
  return (
    <>
      <header className="topbar">
        <span className="marchio">Quadra</span>
        <div className="utente"><span>{s?.user?.email ?? (authSaltata() ? "sviluppo locale, accesso disattivato" : "")}{s?.user?.ruolo ? ` · ${s.user.ruolo}` : ""}</span>
        {s && (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit" className="btn">Esci</button>
          </form>
        )}</div>
      </header>
      <Schede />
    </>
  );
}
