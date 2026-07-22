import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money Turret",
  description: "Dashboard de análise objetiva de gastos (Nubank).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html lang="pt-BR">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
