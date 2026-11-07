import { auth, authSaltata, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const s = await auth();
  if (s || authSaltata()) redirect("/schede");
  return (
    <main style={{ maxWidth: 360, margin: "20vh auto", padding: 16 }}>
      <h1>Quadra</h1>
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/schede" }); }}>
        <button type="submit">Accedi con Google (aicof.it)</button>
      </form>
    </main>
  );
}
