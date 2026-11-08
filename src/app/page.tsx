import { auth, authSaltata, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const s = await auth();
  if (s || authSaltata()) redirect("/schede");
  return (
    <main className="accesso">
      <img src="/brand/quadra-mark.svg" alt="" width={56} height={56} />
      <h1>Quadra</h1>
      <p>Budget e consuntivo della BU Documentale.</p>
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/schede" }); }}>
        <button type="submit" className="btn primary">Accedi con l’account Google aziendale</button>
      </form>
    </main>
  );
}
