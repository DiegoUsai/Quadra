import Barra from "../Barra";
import "../anomalie/anomalie.css";

export default function Forecast() {
  return (
    <>
      <Barra corrente="/forecast" />
      <main className="pagina">
        <h1>Forecast</h1>
        <p className="sottotitolo">Sezione in definizione: cosa mostrare qui lo decidiamo insieme.</p>
        <p>Per ora non c&apos;è nulla da consultare. Consuntivo e Budget sono già attivi dalla barra in alto.</p>
      </main>
    </>
  );
}
