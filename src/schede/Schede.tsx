"use client";
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import markup from "./markup.html";
import "./schede.css";
import "./theme.css";

const carica = (src: string) =>
  new Promise<void>((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(); s.onerror = () => ko(new Error(src));
    document.body.appendChild(s);
  });

export default function Schede() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let attivo = true;
    (window as unknown as { d3: typeof d3 }).d3 = d3;
    (async () => {
      for (const f of ["dash-shim.js", "calcs.js", "ui.js"]) if (attivo) await carica("/schede/" + f);
    })();
    return () => { attivo = false; };
  }, []);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: markup }} style={{ padding: 16 }} />;
}
