import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const DIR = path.join(process.cwd(), "data", "seed");
export const seedDisponibile = () => fs.existsSync(path.join(DIR, "storico_dettaglio.csv"));

export function leggiCsv<T = Record<string, string>>(file: string, delimiter = ","): T[] {
  const testo = fs.readFileSync(path.join(DIR, file), "utf8").replace(/^\uFEFF/, "");
  return Papa.parse<T>(testo, { header: true, skipEmptyLines: true, delimiter }).data;
}
