import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "@/trpc/react";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "I.S Painting Manager",
  description: "Painting business management — CRM, jobs, time, invoices.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          {children}
          <Toaster position="top-right" richColors />
        </TRPCProvider>
      </body>
    </html>
  );
}
