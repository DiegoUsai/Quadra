import Lista, { type Filtri } from "./Lista";

export const dynamic = "force-dynamic";

// Consuntivo: anomalie dello scadenzario (tutte le regole tranne il promemoria D07, che sta nel Budget).
export default function Anomalie({ searchParams }: { searchParams: Promise<Filtri> }) {
  return <Lista searchParams={searchParams} ambito="consuntivo" />;
}
