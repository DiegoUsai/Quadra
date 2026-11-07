import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Dominio ammesso: fissato nel codice per la fase 1 (decisione di Diego: aicof.it).
// Il provider è l'unico punto da cambiare per passare a Microsoft Entra ID (specifiche 4.1).
const DOMINIO = "aicof.it";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { hd: DOMINIO } } })],
  callbacks: {
    // Il parametro hd è solo un suggerimento: il dominio si verifica sempre sull'email verificata.
    signIn: ({ profile }) => !!profile?.email_verified && !!profile.email?.toLowerCase().endsWith("@" + DOMINIO),
    session: ({ session }) => {
      session.user.ruolo = ruoloDi(session.user.email);
      return session;
    },
  },
});

// Ruoli (sezione 14.1). Per ora da variabili d'ambiente; la tabella app_user subentra in fase 7.
function ruoloDi(email?: string | null): "admin" | "editor" | "viewer" {
  const e = (email ?? "").toLowerCase();
  if ((process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((x) => x.trim()).includes(e)) return "admin";
  if ((process.env.EDITOR_EMAILS ?? "").toLowerCase().split(",").map((x) => x.trim()).includes(e)) return "editor";
  return "viewer";
}

// Solo per provare le schede in locale senza credenziali Google: attivo unicamente con `next dev`
// (NODE_ENV=development) e DEV_SKIP_AUTH=1. In produzione e nei test non ha effetto.
export const authSaltata = () => process.env.NODE_ENV === "development" && process.env.DEV_SKIP_AUTH === "1";
export const autorizzato = async () => authSaltata() || !!(await auth());
