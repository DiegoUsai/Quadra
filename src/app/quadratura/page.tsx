import Barra from "../Barra";
import "../anomalie/anomalie.css";

export default function Quadratura() {
  return (
    <>
      <Barra corrente="/quadratura" />
      <main className="pagina">
        <h1>Quadratura HUB</h1>
        <p className="sottotitolo">In arrivo (fase 5 delle specifiche).</p>
        <p>Qui comparirà il confronto tra scadenzario e HUB (CGD) su contratti, costi e ricavi: differenze di importo, contratti presenti in un solo sistema, date diverse. Le ore rendicontate e le assenze si controllano già in <a href="/ore">Ore e presenze</a>.</p>
      </main>
    </>
  );
}
