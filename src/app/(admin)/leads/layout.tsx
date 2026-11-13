import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });
const body = Jost({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = { title: "Pedidos — I.S Painting Manager" };

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable}`}>{children}</div>;
}
