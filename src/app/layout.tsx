import type { ReactNode } from "react";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import "@/schede/theme.css";
import "./app.css";
export const metadata = { title: "Quadra" };
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });
export default function Layout({ children }: { children: ReactNode }) {
  return (<html lang="it" className={`${sans.variable} ${serif.variable}`}><body>{children}</body></html>);
}
