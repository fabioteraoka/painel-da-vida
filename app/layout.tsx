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
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const saved=localStorage.getItem("painel-da-vida-theme");const theme=saved||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;if(theme==="dark"){document.documentElement.classList.add("dark");}else{document.documentElement.classList.remove("dark");}}catch{document.documentElement.dataset.theme="light";document.documentElement.classList.remove("dark");}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
