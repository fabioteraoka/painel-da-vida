import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel da Vida",
  description: "Seu painel pessoal para organizar agenda, tarefas e e-mails.",
  openGraph: {
    title: "Painel da Vida",
    description: "Seu painel pessoal para organizar agenda, tarefas e e-mails.",
  },
};

export default function RootLayout({children}:{readonly children:React.ReactNode}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const saved=localStorage.getItem("painel-da-vida-theme");document.documentElement.dataset.theme=saved||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch{document.documentElement.dataset.theme="light"}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
