"use client";
import { useFormStatus } from "react-dom";

// Il controllo interroga HUB e foglio assenze di persona: richiede 10-20 secondi. Durante l'attesa il pulsante si blocca e lo dice.
export default function BottoneControlla({ etichetta }: { etichetta: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button className="btn primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Controllo in corso…" : etichetta}</button>
      {pending && <span role="status">Sto leggendo HUB e foglio assenze: servono 10-20 secondi, la pagina si aggiorna da sola con l&apos;esito. Non chiuderla.</span>}
    </>
  );
}
