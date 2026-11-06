import crypto from "crypto";
import fs from "fs";
import path from "path";

const ENV_LOCAL_PATH = path.resolve(process.cwd(), ".env.local");

function main() {
  const secret = crypto.randomBytes(32).toString("hex");

  let envContent = "";
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    envContent = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
  }

  let updatedContent: string;
  if (/^APP_SETUP_SECRET=.*/m.test(envContent)) {
    updatedContent = envContent.replace(/^APP_SETUP_SECRET=.*/m, `APP_SETUP_SECRET=${secret}`);
  } else {
    updatedContent =
      (envContent ? envContent.trimEnd() + "\n" : "") + `APP_SETUP_SECRET=${secret}\n`;
  }

  fs.writeFileSync(ENV_LOCAL_PATH, updatedContent, { mode: 0o600 });

  console.log("==================================================================");
  console.log("🔐 NOVO APP_SETUP_SECRET GERADO COM SUCESSO");
  console.log("==================================================================");
  console.log("Chave aleatória gerada (256 bits criptográficos):");
  console.log(secret);
  console.log("==================================================================");
  console.log("Arquivo atualizado: .env.local (permissões 0600, ignorado no git)");
  console.log("Copie este valor e cole no formulário de configuração inicial do app.");
  console.log("==================================================================");
}

main();
