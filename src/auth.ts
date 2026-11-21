import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ruoloDi } from "@/lib/ruoli";

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

// Solo per provare le schede in locale senza credenziali Google: attivo unicamente con `next dev`
// (NODE_ENV=development) e DEV_SKIP_AUTH=1. In produzione e nei test non ha effetto.
export const authSaltata = () => process.env.NODE_ENV === "development" && process.env.DEV_SKIP_AUTH === "1";
export const autorizzato = async () => authSaltata() || !!(await auth());

// Avvio manuale di job che leggono il foglio, scrivono su DB e notificano: solo Editor e Admin, come le server action.
export const puoAvviare = async () => {
  if (authSaltata()) return true;
  const ruolo = (await auth())?.user?.ruolo;
  return ruolo === "admin" || ruolo === "editor";
};
