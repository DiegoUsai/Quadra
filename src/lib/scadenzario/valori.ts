// Formati dello scadenzario (mappatura, sezione 3): euro con punto migliaia e virgola decimale, date gg/mm/aaaa.
export type Cella = string | number | boolean | null | undefined;

export function parseEuro(c: Cella): number | null | "ERR" {
  if (typeof c === "number") return Math.round(c * 100) / 100;
  const s = String(c ?? "").replace(/\u00a0/g, " ").trim();
  if (s === "" || s === "-" || /^€\s*-\s*$/.test(s)) return null;
  const m = s.match(/^(-)?\s*€?\s*(-)?\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?$/);
  if (!m) return "ERR";
  const v = Number(m[3].replace(/\./g, "") + "." + (m[4] ?? "0"));
  return m[1] || m[2] ? -v : v;
}

// Data valida -> "AAAA-MM-GG". Non valida (es. 31/09/2023, 31/12/20226) -> il testo originale, così le regole A04 la vedono.
export function parseData(c: Cella): string | null {
  const s = String(c ?? "").trim();
  if (s === "" || s === "-") return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  const [g, me, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, me - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return s;
  return `${m[3]}-${String(me).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
}

export const testo = (c: Cella) => (c === null || c === undefined ? "" : String(c)).trim();
