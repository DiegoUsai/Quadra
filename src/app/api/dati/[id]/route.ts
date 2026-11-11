import { autorizzato } from "@/auth";
import { caricaDataset, datasetNoti } from "@/lib/seed/dataset";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await autorizzato())) return new Response("non autorizzato", { status: 401 });
  const { id } = await params;
  if (!datasetNoti(id)) return new Response("dataset sconosciuto", { status: 404 });
  // ?versione=N: per i dataset del budget 2027 mostra una versione diversa da quella attiva (sola lettura)
  const v = new URL(req.url).searchParams.get("versione");
  const versione = v !== null && /^\d{1,3}$/.test(v) ? Number(v) : undefined;
  try { return Response.json(await caricaDataset(id, versione)); }
  catch (e) { return new Response(e instanceof Error ? e.message : "errore", { status: 404 }); }
}
