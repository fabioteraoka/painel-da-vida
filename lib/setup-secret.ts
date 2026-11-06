import crypto from "crypto";
import fs from "fs";
import path from "path";

const ENV_LOCAL_PATH = path.resolve(process.cwd(), ".env.local");

/**
 * Obtém ou inicializa a chave de uso único APP_SETUP_SECRET de forma segura.
 *
 * Princípios de segurança:
 * 1. A chave é gerada com 32 bytes aleatórios criptográficos (256 bits em hex).
 * 2. É persistida no arquivo `.env.local` com permissões restritas (0600).
 * 3. O arquivo `.env.local` está no `.gitignore` e NUNCA é commitado nem exposto em bundles.
 * 4. Jamais expõe o valor no bundle do cliente (Next.js não envia process.env sem NEXT_PUBLIC_).
 * 5. A comparação de candidatos é estritamente em tempo constante (timingSafeEqual) para
 *    prevenir ataques de temporização (timing attacks).
 */
export function getAppSetupSecret(): string {
  // 1. Tenta obter das variáveis já carregadas no processo
  const existingEnv = process.env.APP_SETUP_SECRET || process.env.SETUP_SECRET;
  if (existingEnv && existingEnv.trim().length >= 16) {
    return existingEnv.trim();
  }

  // 2. Tenta ler diretamente do arquivo .env.local se o processo ainda não recarregou
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    try {
      const content = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
      const match = content.match(/^APP_SETUP_SECRET\s*=\s*([^\r\n#]+)/m);
      if (match && match[1]?.trim()) {
        const found = match[1].trim();
        process.env.APP_SETUP_SECRET = found;
        return found;
      }
    } catch {
      // Ignora erro de leitura e prossegue para geração segura
    }
  }

  // 3. Se não houver segredo configurado, gera um aleatório de 256 bits
  const generatedSecret = crypto.randomBytes(32).toString("hex");

  try {
    let currentContent = "";
    if (fs.existsSync(ENV_LOCAL_PATH)) {
      currentContent = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
    }

    let updatedContent: string;
    if (/^APP_SETUP_SECRET=.*/m.test(currentContent)) {
      updatedContent = currentContent.replace(
        /^APP_SETUP_SECRET=.*/m,
        `APP_SETUP_SECRET=${generatedSecret}`,
      );
    } else {
      updatedContent =
        (currentContent ? currentContent.trimEnd() + "\n" : "") +
        `APP_SETUP_SECRET=${generatedSecret}\n`;
    }

    fs.writeFileSync(ENV_LOCAL_PATH, updatedContent, { mode: 0o600 });
  } catch (err) {
    console.error("[Setup Secret] Falha ao persistir segredo em .env.local:", err);
  }

  process.env.APP_SETUP_SECRET = generatedSecret;
  return generatedSecret;
}

/**
 * Validação segura de token em tempo constante (timingSafeEqual)
 * para evitar ataques de temporização.
 */
export function verifySetupSecret(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== "string") {
    return false;
  }

  const actualSecret = getAppSetupSecret();
  if (!actualSecret) {
    return false;
  }

  const candidateTrimmed = candidate.trim();
  const actualTrimmed = actualSecret.trim();

  const candidateBuffer = Buffer.from(candidateTrimmed);
  const actualBuffer = Buffer.from(actualTrimmed);

  if (candidateBuffer.length !== actualBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(candidateBuffer, actualBuffer);
  } catch {
    return false;
  }
}
