import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";

type CollectedPrice = { price: number; currency: string; source: string; observedAt: Date };

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224;
}

async function assertPublicHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL do produto inválida.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("O monitor aceita apenas URLs HTTPS públicas.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("O endereço do produto precisa ser público.");
  }
  const family = isIP(host);
  const isPublicAddress = (address: string) => {
    const normalized = address.toLowerCase();
    const addressFamily = isIP(normalized);
    if (addressFamily === 4) return !isPrivateIpv4(normalized);
    if (addressFamily === 6) return !(normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff") || normalized.startsWith("::ffff:") || normalized.startsWith("2001:db8:") || normalized.startsWith("2001:10:"));
    return false;
  };
  if (family && !isPublicAddress(host)) throw new Error("O endereço do produto precisa ser público.");
  if (!family) {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      throw new Error("O endereço do produto precisa apontar para um host público.");
    }
  }
  return url;
}

async function fetchProductPage(initialUrl: string) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 5; redirects++) {
    await assertPublicHttpsUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": "PainelDaVidaPriceMonitor/1.0 (+https://github.com/fabioteraoka/painel-da-vida)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Redirecionamento de produto inválido ou excessivo.");
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`A loja respondeu com HTTP ${response.status}.`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      throw new Error("A página da loja não retornou HTML.");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 2_000_000) throw new Error("A página da loja excede o tamanho aceito.");
    const reader = response.body?.getReader();
    if (!reader) return { html: await response.text(), url: response.url || url };
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new Error("A página da loja excede o tamanho aceito.");
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
    return { html, url: response.url || url };
  }
  throw new Error("Não foi possível abrir a página do produto.");
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (comma >= 0) {
    const groups = cleaned.split(",");
    normalized = groups.length > 1 && groups.at(-1)?.length === 3
      ? groups.join("")
      : groups.slice(0, -1).join("") + "." + groups.at(-1);
  } else if (dot >= 0) {
    const groups = cleaned.split(".");
    if (groups.length > 2 && groups.slice(1).every((group) => group.length === 3)) {
      normalized = groups.join("");
    } else if (groups.at(-1)?.length === 3) {
      normalized = groups.join("");
    } else if (groups.length > 2) {
      normalized = groups.slice(0, -1).join("") + "." + groups.at(-1);
    }
  }
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function htmlAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    attributes[match[1].toLowerCase()] = match[2];
  }
  return attributes;
}

function productOffers(value: unknown): Array<{ price?: unknown; priceCurrency?: unknown; lowPrice?: unknown }> {
  if (Array.isArray(value)) return value.flatMap(productOffers);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  const results: Array<{ price?: unknown; priceCurrency?: unknown; lowPrice?: unknown }> = [];
  if (isProduct) {
    const offers = object.offers;
    const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
    for (const offer of list) {
      if (!offer || typeof offer !== "object") continue;
      const item = offer as Record<string, unknown>;
      results.push({ price: item.price ?? (item.priceSpecification && (item.priceSpecification as Record<string, unknown>).price), lowPrice: item.lowPrice, priceCurrency: item.priceCurrency });
    }
  }
  for (const [key, child] of Object.entries(object)) {
    if (key === "offers") continue;
    results.push(...productOffers(child));
  }
  return results;
}

function extractStructuredPrice(html: string, defaultCurrency: string): { price: number; currency: string } | null {
  const currencyTag = Array.from(html.matchAll(/<meta\\b[^>]*>/gi))
    .map((match) => htmlAttributes(match[0]))
    .find((attrs) => [attrs.property, attrs.name, attrs.itemprop].some((key) => key?.toLowerCase().includes("price:currency")));
  const pageCurrency = currencyTag?.content?.toUpperCase() ?? defaultCurrency;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const offers = productOffers(parsed);
      for (const offer of offers) {
        const price = parsePrice(offer.price ?? offer.lowPrice);
        if (price) return { price, currency: String(offer.priceCurrency ?? defaultCurrency).toUpperCase() };
      }
    } catch {
      // Malformed JSON-LD on one script does not invalidate other page metadata.
    }
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = htmlAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (["product:price:amount", "og:price:amount", "price"].includes(key)) {
      const price = parsePrice(attrs.content ?? attrs.value);
      if (price) return { price, currency: (attrs.currency ?? pageCurrency).toUpperCase() };
    }
  }
  for (const match of html.matchAll(/<[^>]+itemprop=["']price["'][^>]*>/gi)) {
    const attrs = htmlAttributes(match[0]);
    const price = parsePrice(attrs.content ?? attrs.value);
    if (price) return { price, currency: (attrs.currency ?? pageCurrency).toUpperCase() };
  }

  // Amazon often renders the current price in its primary price block without
  // exposing Product/Offer JSON-LD or price meta tags.
  const primaryPriceId = /id=["'](?:corePriceDisplay_desktop_feature_div|corePrice_feature_div)["']/i.exec(html);
  if (primaryPriceId?.index !== undefined) {
    const primaryPriceBlock = html.slice(primaryPriceId.index, primaryPriceId.index + 20_000);
    for (const match of primaryPriceBlock.matchAll(/<span\b[^>]*class=["'][^"']*\ba-offscreen\b[^"']*["'][^>]*>([^<]+)<\/span>/gi)) {
      const priceTagOffset = match.index ?? 0;
      const precedingMarkup = primaryPriceBlock.slice(Math.max(0, priceTagOffset - 1_000), priceTagOffset);
      const enclosingPrice = precedingMarkup.match(/<span\b[^>]*class=["'][^"']*\ba-price(?:\s|["'])[^"']*["'][^>]*>/gi)?.at(-1) ?? "";
      if (!enclosingPrice || /a-text-price/i.test(enclosingPrice)) continue;
      const price = parsePrice(match[1]);
      if (price) return { price, currency: pageCurrency || defaultCurrency };
    }
  }
  return null;
}

export async function collectPrice(product: { url: string | null; source: string | null }): Promise<CollectedPrice> {
  if (!product.url) throw new Error("Produto sem URL de coleta.");
  const { html, url } = await fetchProductPage(product.url);
  const defaultCurrency = new URL(url).hostname.toLowerCase().endsWith(".br") ? "BRL" : "";
  const extracted = extractStructuredPrice(html, defaultCurrency);
  if (!extracted) throw new Error("A página não expôs um preço estruturado reconhecido.");
  if (extracted.currency !== "BRL") throw new Error(extracted.currency ? `Moeda não suportada para monitoramento: ${extracted.currency}.` : "A página não informou a moeda do preço.");
  return { price: extracted.price, currency: "BRL", source: new URL(url).hostname, observedAt: new Date() };
}

export async function monitorPrices(userId?: string) {
  const products = await prisma.monitoredProduct.findMany({
    where: { active: true, ...(userId ? { userId } : {}) },
  });
  const results: Array<{ productId: string; status: "updated" | "error"; price?: number; alertCreated?: boolean; error?: string }> = [];

  const checkProduct = async (product: any) => {
    try {
      const collected = await collectPrice(product);
      const targetPrice = Number(product.targetPrice);
      const previousPrice = product.currentPrice == null ? null : Number(product.currentPrice);
      const historyCount = Number(await prisma.priceHistory.count({ where: { monitoredProductId: product.id } })) || 0;
      const crossedTarget = collected.price <= targetPrice && (previousPrice === null || previousPrice > targetPrice);
      const unreadAlert = await prisma.priceAlert.findFirst({ where: { monitoredProductId: product.id, isRead: false } });
      const alertCreated = Boolean(product.notifyTarget !== false && crossedTarget && !unreadAlert);
      const previousLowest = product.lowestPrice == null ? (previousPrice ?? collected.price) : Number(product.lowestPrice);
      const previousHighest = product.highestPrice == null ? (previousPrice ?? collected.price) : Number(product.highestPrice);
      const previousAverage = product.averagePrice == null ? (previousPrice ?? collected.price) : Number(product.averagePrice);

      await prisma.$transaction(async (tx: any) => {
        await tx.priceHistory.create({
          data: {
            monitoredProductId: product.id,
            price: collected.price,
            currency: collected.currency,
            source: collected.source,
            observedAt: collected.observedAt,
          },
        });
        await tx.monitoredProduct.update({
          where: { id: product.id },
          data: {
            currentPrice: collected.price,
            lowestPrice: Math.min(previousLowest, collected.price),
            highestPrice: Math.max(previousHighest, collected.price),
            averagePrice: ((previousAverage * historyCount) + collected.price) / (historyCount + 1),
            source: collected.source,
            lastChecked: collected.observedAt,
            lastAttemptedAt: collected.observedAt,
            lastCheckError: null,
          },
        });
        if (alertCreated) {
          await tx.priceAlert.create({
            data: { monitoredProductId: product.id, price: collected.price, targetPrice, isRead: false },
          });
        }
      });
      results.push({ productId: product.id, status: "updated", price: collected.price, alertCreated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na coleta do preço.";
      console.error("Price monitoring failed for product", product.id, message);
      try {
        await prisma.monitoredProduct.update({
          where: { id: product.id },
          data: { lastAttemptedAt: new Date(), lastCheckError: message },
        });
      } catch (recordError) {
        console.error("Could not persist price monitoring failure", product.id, recordError);
      }
      results.push({ productId: product.id, status: "error", error: message });
    }
  };

  const queue = products as any[];
  let nextProductIndex = 0;
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (nextProductIndex < queue.length) {
      const product = queue[nextProductIndex++];
      await checkProduct(product);
    }
  });
  await Promise.all(workers);
  return { scanned: products.length, updated: results.filter((item) => item.status === "updated").length, failed: results.filter((item) => item.status === "error").length, results };
}
