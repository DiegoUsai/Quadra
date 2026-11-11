import { autorizzato } from "@/auth";
import { ANNO_VERSIONATO, elencoVersioni } from "@/lib/seed/dataset";

export async function GET() {
  if (!(await autorizzato())) return new Response("non autorizzato", { status: 401 });
  return Response.json({ anno: ANNO_VERSIONATO, versioni: await elencoVersioni(ANNO_VERSIONATO) });
}
