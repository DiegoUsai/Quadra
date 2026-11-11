import Lista, { type Filtri } from "../../anomalie/Lista";

export const dynamic = "force-dynamic";

// Budget: promemoria dei progetti non chiusi con residuo da lavorare (regola D07).
export default function DaMettereABudget({ searchParams }: { searchParams: Promise<Filtri> }) {
  return <Lista searchParams={searchParams} ambito="budget" />;
}
