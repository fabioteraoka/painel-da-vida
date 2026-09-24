import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; mockStore?: Map<string, Map<string, any>> };

export const isDemoMode = process.env.DEMO_MODE === "true";

export const isDemoMode =
  process.env.DEMO_MODE === "true" ||
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.DEMO_MODE !== "false" ||
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.trim() === "";

function createMockPrisma(): PrismaClient {
  console.info("[Painel da Vida] Operando com armazenamento local otimizado (Zero-Config)");
  const inMemoryStore = (globalForPrisma.mockStore ??= new Map<string, Map<string, any>>());

  const getStore = (model: string) => {
    const key = model.toLowerCase();
    if (!inMemoryStore.has(key)) {
      inMemoryStore.set(key, new Map());
    }
    return inMemoryStore.get(key)!;
  };

  const populateRelations = (model: string, item: any, include: any) => {
    if (!item || !include) return item;
    const copy = { ...item };
    const m = model.toLowerCase();

    if (m === "bill") {
      if (include.paymentAccount) {
        copy.paymentAccount = copy.paymentAccountId
          ? getStore("paymentaccount").get(copy.paymentAccountId) ?? null
          : null;
      }
      if (include.responsiblePerson) {
        copy.responsiblePerson = copy.responsiblePersonId
          ? getStore("person").get(copy.responsiblePersonId) ?? null
          : null;
      }
    }

    if (m === "task") {
      if (include.bill) {
        copy.bill = copy.billId ? getStore("bill").get(copy.billId) ?? null : null;
      }
    }

    if (m === "monitoredproduct") {
      if (include.history) {
        copy.history = Array.from(getStore("pricehistory").values()).filter(
          (h: any) => h.monitoredProductId === item.id,
        );
      }
      if (include.alerts) {
        copy.alerts = Array.from(getStore("pricealert").values()).filter(
          (a: any) => a.monitoredProductId === item.id,
        );
      }
    }

    return copy;
  };

  const seedStore = () => {
    if (inMemoryStore.size > 0) {
      return; // Persistência do mock sem reseeding após alterações
    }
    const userStore = getStore("user");
    const personStore = getStore("person");
    const accountStore = getStore("paymentaccount");
    const productStore = getStore("monitoredproduct");
    const billStore = getStore("bill");
    const taskStore = getStore("task");

    const defaultUserId = "user-fabio-teraoka";
    userStore.set(defaultUserId, {
      id: defaultUserId,
      name: "Fábio Teraoka",
      email: "fteraoka@gmail.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const carolId = "person-carol";
    personStore.set(carolId, {
      id: carolId,
      name: "Carol",
      relation: "Esposa",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const itauId = "acc-itau";
    accountStore.set(itauId, {
      id: itauId,
      name: "Itaú Débito",
      type: "BANK_ACCOUNT",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const nubankId = "acc-nubank";
    accountStore.set(nubankId, {
      id: nubankId,
      name: "Conta Nubank",
      type: "BANK_ACCOUNT",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const xpId = "acc-xp";
    accountStore.set(xpId, {
      id: xpId,
      name: "Cartão XP Visa Infinite",
      type: "CREDIT_CARD",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Produtos monitorados
    productStore.set("prod-panela", {
      id: "prod-panela",
      title: "Panela de Pressão Tramontina Solar 6L Inox",
      targetPrice: 260.0,
      currentPrice: 249.9,
      source: "Amazon",
      url: "https://www.amazon.com.br",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    productStore.set("prod-monitor", {
      id: "prod-monitor",
      title: "Monitor Dell 27\" 4K USB-C S2722QC",
      targetPrice: 2200.0,
      currentPrice: 2450.0,
      source: "Zoom / Dell",
      url: "https://www.zoom.com.br",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    productStore.set("prod-fone", {
      id: "prod-fone",
      title: "Fone de Ouvido Sony WH-1000XM5 ANC",
      targetPrice: 1850.0,
      currentPrice: 1999.0,
      source: "Mercado Livre",
      url: "https://www.mercadolivre.com.br",
      active: true,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Contas com vencimentos nos próximos 10 dias
    const now = Date.now();
    const d3 = new Date(now + 3 * 24 * 60 * 60 * 1000);
    const d5 = new Date(now + 5 * 24 * 60 * 60 * 1000);
    const d7 = new Date(now + 7 * 24 * 60 * 60 * 1000);
    const d9 = new Date(now + 9 * 24 * 60 * 60 * 1000);

    const billEnel = {
      id: "bill-enel",
      merchant: "Enel Distribuição SP",
      sender: "fatura@eneldistribuicao.com.br",
      subject: "Sua conta de energia elétrica digital chegou",
      amount: 245.8,
      dueDate: d3,
      category: "UTILITIES",
      status: "NEEDS_REVIEW",
      confidence: 0.98,
      aiReason: "Identificado boleto de energia com código de barras e PIX copia e cola",
      pixCode: "00020126580014br.gov.bcb.pix0136enel-energia-sp@enel.com5204000053039865405245.805802BR5919Enel Distribuicao6009Sao Paulo62070503***6304ABCD",
      barcode: "846700000028 458001090113 000456123450 123456789012",
      paymentUrl: "https://www.enel.com.br/segunda-via",
      responsibleType: "ME",
      responsibleName: "Fábio Teraoka",
      paymentAccountId: itauId,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    billStore.set(billEnel.id, billEnel);

    const billNubank = {
      id: "bill-nubank",
      merchant: "Fatura Cartão Nubank (Carol)",
      sender: "fatura@nubank.com.br",
      subject: "A fatura do seu cartão Nubank fechou: R$ 1.340,50",
      amount: 1340.5,
      dueDate: d5,
      category: "CREDIT_CARD",
      status: "NEEDS_REVIEW",
      confidence: 0.95,
      aiReason: "Fatura de cartão de crédito identificada com responsável Carol",
      pixCode: "00020126580014br.gov.bcb.pix0136fatura-nubank@nubank.com.br52040000530398654061340.505802BR5906Nubank6009Sao Paulo630477BB",
      barcode: "26090000180000000001000000000000 8 98760000134050",
      paymentUrl: "https://app.nubank.com.br",
      responsibleType: "OTHER",
      responsibleName: "Carol",
      responsiblePersonId: carolId,
      paymentAccountId: nubankId,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    billStore.set(billNubank.id, billNubank);

    const billSabesp = {
      id: "bill-sabesp",
      merchant: "Sabesp Água e Esgoto",
      sender: "atendimento@sabesp.sp.gov.br",
      subject: "Segunda via - Fatura de Água e Esgoto",
      amount: 112.4,
      dueDate: d7,
      category: "UTILITIES",
      status: "CONFIRMED",
      confidence: 0.99,
      aiReason: "Concessionária de saneamento com pagamento agendado",
      pixCode: "00020126580014br.gov.bcb.pix0136sabesp-pix@sabesp.sp.gov.br5204000053039865405112.405802BR5906Sabesp6009Sao Paulo6304EF12",
      barcode: "846500000012 124001090222 000789456123 987654321012",
      paymentUrl: "https://agenciavirtual.sabesp.com.br",
      responsibleType: "ME",
      responsibleName: "Fábio Teraoka",
      paymentAccountId: itauId,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    billStore.set(billSabesp.id, billSabesp);

    const billCondominio = {
      id: "bill-condominio",
      merchant: "Condomínio Edifício Solar",
      sender: "cobranca@administradora.com.br",
      subject: "Taxa Condominial Mensal - Ref Mês Atual",
      amount: 850.0,
      dueDate: d9,
      category: "HOUSING",
      status: "NEEDS_REVIEW",
      confidence: 0.96,
      aiReason: "Boleto bancário Itaú da taxa condominial",
      pixCode: "00020126580014br.gov.bcb.pix0136condominio-solar@adm.com.br5204000053039865405850.005802BR5916Condominio Solar6009Sao Paulo630499A1",
      barcode: "34191790010104351004791020150008 1 89120000085000",
      paymentUrl: "https://portal.administradora.com.br/boletos",
      responsibleType: "ME",
      responsibleName: "Fábio Teraoka",
      paymentAccountId: itauId,
      userId: defaultUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    billStore.set(billCondominio.id, billCondominio);

    // Tarefas com prioridade e vínculos
    const initialTaskList = [
      {
        id: "task-enel",
        title: "Pagar Enel Distribuição SP — R$ 245,80",
        description: "Conta de energia elétrica com vencimento próximo em 3 dias.",
        priority: "HIGH",
        status: "PENDING",
        dueAt: d3,
        billId: billEnel.id,
        userId: defaultUserId,
      },
      {
        id: "task-nubank",
        title: "Pagar Fatura Cartão Nubank (Carol) — R$ 1.340,50",
        description: "Fatura do cartão de crédito da Carol.",
        priority: "HIGH",
        status: "PENDING",
        dueAt: d5,
        billId: billNubank.id,
        userId: defaultUserId,
      },
      {
        id: "task-ptn",
        title: "Revisar manual PTN",
        description: "Conferir os tópicos 3 e 4 atualizados pelo Arthur antes das 17h.",
        priority: "HIGH",
        status: "PENDING",
        dueAt: new Date(now),
        userId: defaultUserId,
      },
      {
        id: "task-doc",
        title: "Enviar documentação pendente",
        description: "Assinar e enviar documentos para a Thaís.",
        priority: "HIGH",
        status: "PENDING",
        dueAt: new Date(now),
        userId: defaultUserId,
      },
      {
        id: "task-fornecedor",
        title: "Responder fornecedor ABC",
        description: "Confirmar previsão de recebimento do lote na sexta.",
        priority: "MEDIUM",
        status: "PENDING",
        dueAt: new Date(now + 24 * 60 * 60 * 1000),
        userId: defaultUserId,
      },
      {
        id: "task-planilha",
        title: "Atualizar controles de suprimentos",
        description: "Conferir estoque e atualizar planilha de acompanhamento.",
        priority: "MEDIUM",
        status: "PENDING",
        dueAt: new Date(now + 48 * 60 * 60 * 1000),
        userId: defaultUserId,
      },
      {
        id: "task-semana",
        title: "Planejar próxima semana e metas de fábrica",
        description: "Organizar prioridades do time operacional.",
        priority: "LOW",
        status: "PENDING",
        dueAt: new Date(now + 4 * 24 * 60 * 60 * 1000),
        userId: defaultUserId,
      },
    ];

    for (const t of initialTaskList) {
      taskStore.set(t.id, {
        ...t,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  };

  seedStore();

  const matchesWhere = (item: any, where?: Record<string, any>): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, expected]) => {
      if (key === "OR") return Array.isArray(expected) && expected.some((condition) => matchesWhere(item, condition));
      if (key === "AND") return Array.isArray(expected) && expected.every((condition) => matchesWhere(item, condition));
      const actual = item[key];
      if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
        return Object.entries(expected).every(([operator, operand]) => {
          if (operator === "mode") return true;
          if (operator === "in") return Array.isArray(operand) && operand.includes(actual);
          if (operator === "notIn") return Array.isArray(operand) && !operand.includes(actual);
          if (operator === "not") return actual !== operand;
          if (operator === "equals") return actual === operand;
          if (operator === "contains") {
            const left = String(actual ?? "");
            const right = String(operand ?? "");
            return expected.mode === "insensitive"
              ? left.toLowerCase().includes(right.toLowerCase())
              : left.includes(right);
          }
          if (operator === "lte") return actual != null && new Date(actual).getTime() <= new Date(operand as any).getTime();
          if (operator === "lt") return actual != null && new Date(actual).getTime() < new Date(operand as any).getTime();
          if (operator === "gte") return actual != null && new Date(actual).getTime() >= new Date(operand as any).getTime();
          if (operator === "gt") return actual != null && new Date(actual).getTime() > new Date(operand as any).getTime();
          return actual === expected;
        });
      }
      return actual === expected;
    });
  };

  const createModelProxy = (model: string) => ({
    findMany: async (args?: any) => {
      let items = Array.from(getStore(model).values()).filter((item: any) => matchesWhere(item, args?.where));
      const orderBy = Array.isArray(args?.orderBy) ? args.orderBy : args?.orderBy ? [args.orderBy] : [];
      for (const order of [...orderBy].reverse()) {
        const [key, direction] = Object.entries(order)[0] ?? [];
        if (!key) continue;
        items.sort((a: any, b: any) => {
          const left = a[key] instanceof Date ? a[key].getTime() : a[key];
          const right = b[key] instanceof Date ? b[key].getTime() : b[key];
          if (left === right) return 0;
          return (left < right ? -1 : 1) * (direction === "desc" ? -1 : 1);
        });
      }
      if (args?.skip) items = items.slice(args.skip);
      if (typeof args?.take === "number") items = items.slice(0, args.take);
      if (args?.include) {
        items = items.map((item: any) => populateRelations(model, item, args.include));
      }
      return items;
    },
    findFirst: async (args?: any) => {
      const items = Array.from(getStore(model).values()).filter((item: any) => matchesWhere(item, args?.where));
      if (items.length === 0) return null;
      const res = items[0];
      return args?.include ? populateRelations(model, res, args.include) : res;
    },
    findUnique: async (args?: any) => {
      const store = getStore(model);
      let found: any = null;
      if (args?.where?.id) {
        found = store.get(args.where.id) ?? null;
      } else if (args?.where?.email) {
        for (const v of store.values()) {
          if (v.email === args.where.email) {
            found = v;
            break;
          }
        }
      } else if (args?.where?.billId) {
        for (const v of store.values()) {
          if (v.billId === args.where.billId) {
            found = v;
            break;
          }
        }
      } else if (args?.where?.userId_provider) {
        for (const v of store.values()) {
          if (
            v.userId === args.where.userId_provider.userId &&
            v.provider === args.where.userId_provider.provider
          ) {
            found = v;
            break;
          }
        }
      } else {
        found = Array.from(store.values()).find((item: any) => matchesWhere(item, args?.where)) ?? null;
      }
      if (!found) return null;
      return args?.include ? populateRelations(model, found, args.include) : found;
    },
    create: async (args?: any) => {
      const id = args?.data?.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const record = { id, createdAt: new Date(), updatedAt: new Date(), ...(args?.data ?? {}) };
      getStore(model).set(id, record);
      return record;
    },
    createMany: async (args?: any) => {
      const store = getStore(model);
      const list = args?.data ?? [];
      for (const item of list) {
        const id = item.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        store.set(id, { id, createdAt: new Date(), updatedAt: new Date(), ...item });
      }
      return { count: list.length };
    },
    update: async (args?: any) => {
      const store = getStore(model);
      const existing = args?.where?.id ? store.get(args.where.id) : null;
      const updated = { ...(existing ?? {}), ...(args?.data ?? {}), updatedAt: new Date() };
      if (args?.where?.id) store.set(args.where.id, updated);
      return args?.include ? populateRelations(model, updated, args.include) : updated;
    },
    updateMany: async (args?: any) => {
      const store = getStore(model);
      let count = 0;
      for (const [id, item] of store.entries()) {
        if (matchesWhere(item, args?.where)) {
          store.set(id, { ...item, ...(args?.data ?? {}), updatedAt: new Date() });
          count++;
        }
      }
      return { count };
    },
    upsert: async (args?: any) => {
      const store = getStore(model);
      let found: any = null;
      if (args?.where?.email) {
        for (const v of store.values()) {
          if (v.email === args.where.email) {
            found = v;
            break;
          }
        }
      } else if (args?.where?.id) {
        found = store.get(args.where.id);
      } else if (args?.where?.userId_provider) {
        for (const v of store.values()) {
          if (
            v.userId === args.where.userId_provider.userId &&
            v.provider === args.where.userId_provider.provider
          ) {
            found = v;
            break;
          }
        }
      } else if (args?.where?.userId_externalId) {
        for (const v of store.values()) {
          if (
            v.userId === args.where.userId_externalId.userId &&
            v.externalId === args.where.userId_externalId.externalId
          ) {
            found = v;
            break;
          }
        }
      }
      if (found) {
        const updated = { ...found, ...(args?.update ?? {}), updatedAt: new Date() };
        store.set(found.id, updated);
        return updated;
      }
      const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const created = { id, createdAt: new Date(), updatedAt: new Date(), ...(args?.create ?? {}) };
      store.set(id, created);
      return created;
    },
    delete: async (args?: any) => {
      if (args?.where?.id) getStore(model).delete(args.where.id);
      return {};
    },
    deleteMany: async (args?: any) => {
      const store = getStore(model);
      let count = 0;
      for (const [id, item] of store.entries()) {
        if (matchesWhere(item, args?.where)) {
          store.delete(id);
          count++;
        }
      }
      return { count };
    },
    count: async (args?: any) => {
      const items = Array.from(getStore(model).values());
      return items.filter((item: any) => matchesWhere(item, args?.where)).length;
    },
  });

  const mockPrisma = new Proxy(
    {},
    {
      get: (_, prop: string) => {
        if (prop === "$queryRaw" || prop === "$executeRaw") {
          return async () => [{ 1: 1 }];
        }
        if (prop === "$transaction") {
          return async (operation: any) => typeof operation === "function" ? operation(mockPrisma) : Promise.all(operation);
        }
        if (prop.startsWith("$")) {
          return async () => null;
        }
        return createModelProxy(prop);
      },
    },
  );
  return mockPrisma as unknown as PrismaClient;
}

let realClient: PrismaClient | null = null;
try {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    realClient = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
} catch (error) {
  if (!isDemoMode) throw error;
  realClient = null;
}

const mockFallback = isDemoMode ? globalForPrisma.prisma ?? createMockPrisma() : null;

const unavailablePrisma = new Proxy({}, {
  get: (_, model: string) => {
    if (model.startsWith("$")) return async () => { throw new Error("DATABASE_URL obrigatória e banco indisponível. Configure o banco ou habilite DEMO_MODE explicitamente."); };
    return new Proxy({}, {
      get: () => async () => { throw new Error("DATABASE_URL obrigatória e banco indisponível. Configure o banco ou habilite DEMO_MODE explicitamente."); },
    });
  },
}) as unknown as PrismaClient;

export const prisma =
  globalForPrisma.prisma ??
  (realClient
    ? new Proxy(realClient, {
        get(target: any, prop: string) {
          const original = target[prop];
          if (typeof original === "object" && original !== null) {
            return new Proxy(original, {
              get(modelTarget: any, modelProp: string) {
                const method = modelTarget[modelProp];
                if (typeof method === "function") {
                  return async (...args: any[]) => {
                    try {
                      return await method.apply(modelTarget, args);
                    } catch (err: any) {
                      if (!isDemoMode || !mockFallback) throw err;
                      console.warn(
                        `[Painel da Vida] Prisma error on ${prop}.${modelProp}, falling back to demo data:`,
                        err?.message || err,
                      );
                      const mockModel = (mockFallback as any)[prop];
                      if (mockModel && typeof mockModel[modelProp] === "function") {
                        return await mockModel[modelProp](...args);
                      }
                      throw err;
                    }
                  };
                }
                return method;
              },
            });
          }
          if (typeof original === "function") {
            return async (...args: any[]) => {
              try {
                return await original.apply(target, args);
              } catch (err: any) {
                if (!isDemoMode || !mockFallback) throw err;
                console.warn(
                  `[Painel da Vida] Prisma error on ${prop}, falling back to demo data:`,
                  err?.message || err,
                );
                const mockMethod = (mockFallback as any)[prop];
                if (typeof mockMethod === "function") {
                  return await mockMethod(...args);
                }
                throw err;
              }
            };
          }
          return original;
        },
      })
    : isDemoMode && mockFallback
      ? mockFallback
      : unavailablePrisma);

if (isDemoMode || process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

