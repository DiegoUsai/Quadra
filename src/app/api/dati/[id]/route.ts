import { autorizzato } from "@/auth";
import { caricaDataset, datasetNoti } from "@/lib/seed/dataset";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await autorizzato())) return new Response("non autorizzato", { status: 401 });
  const { id } = await params;
  if (!datasetNoti(id)) return new Response("dataset sconosciuto", { status: 404 });
  return Response.json(await caricaDataset(id));
}
