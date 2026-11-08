import { REGOLE } from "./indice";

// Le soglie devono avere le stesse chiavi e gli stessi tipi dei valori iniziali: una soglia scritta male non deve far tacere una regola.
export function soglieValide(codice: string, testo: string): Record<string, unknown> {
  const def = REGOLE.find((r) => r.codice === codice);
  if (!def) throw new Error("regola sconosciuta");
  let nuove: unknown;
  try { nuove = JSON.parse(testo || "{}"); } catch { throw new Error("le soglie non sono un JSON valido"); }
  if (!nuove || typeof nuove !== "object" || Array.isArray(nuove)) throw new Error("le soglie devono essere un oggetto JSON");
  for (const [k, v] of Object.entries(nuove)) {
    if (!(k in def.soglie)) throw new Error(`soglia sconosciuta: ${k}`);
    const atteso = (def.soglie as Record<string, unknown>)[k];
    if (Array.isArray(atteso) !== Array.isArray(v) || (!Array.isArray(atteso) && typeof atteso !== typeof v)) throw new Error(`tipo non valido per ${k}`);
  }
  return { ...def.soglie, ...(nuove as object) };
}
