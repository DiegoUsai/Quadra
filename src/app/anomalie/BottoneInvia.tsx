"use client";
import { useFormStatus } from "react-dom";

// Pulsante di invio con stato di attesa: evita il doppio clic, che manderebbe il messaggio due volte.
export default function BottoneInvia({ etichetta }: { etichetta: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Invio in corso…" : etichetta}</button>;
}
