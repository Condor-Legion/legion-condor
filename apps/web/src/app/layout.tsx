import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Legion Condor",
  description: "Plataforma del clan Legion Condor"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
