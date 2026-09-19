import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Painel da Vida", description: "Seu painel pessoal para organizar agenda, tarefas e e-mails." };

export default function RootLayout({children}:{readonly children:React.ReactNode}) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}