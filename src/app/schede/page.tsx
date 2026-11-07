import Schede from "@/schede/Schede";
import { auth, signOut, authSaltata } from "@/auth";

export default async function Page() {
  const s = await auth();
  return (
    <>
      <header style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, padding: "8px 16px", fontSize: 13, color: "var(--color-fg-muted)" }}>
        <span>{s?.user?.email ?? (authSaltata() ? "locale (accesso saltato)" : "")}{s?.user?.ruolo ? ` · ${s.user.ruolo}` : ""}</span>
        {s && (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit" style={{ font: "inherit", background: "none", border: "1px solid var(--color-border-line)", borderRadius: 6, padding: "2px 10px", color: "var(--color-fg)", cursor: "pointer" }}>Esci</button>
          </form>
        )}
      </header>
      <Schede />
    </>
  );
}
