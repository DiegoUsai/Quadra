import Barra from "../Barra";
import "../anomalie/anomalie.css";

// Mostrata mentre la pagina legge l'HUB (dettaglio e reporting del progetto): qualche secondo.
export default function Caricamento() {
  return (
    <>
      <Barra corrente="/analisi-contratto" />
      <main className="pagina">
        <h1>Analisi contratto</h1>
        <p role="status" aria-live="polite" style={{ fontWeight: 600 }}>Sto leggendo i dati del contratto dall&apos;HUB e dallo scadenzario: servono qualche secondo, la pagina si aggiorna da sola.</p>
      </main>
    </>
  );
}
