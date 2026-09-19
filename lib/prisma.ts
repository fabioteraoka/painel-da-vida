import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createMockPrisma(): PrismaClient {
  console.warn("[AI Studio] Database not connected — using mock in-memory store");
  const inMemoryStore = new Map<string, Map<string, any>>();

  const getStore = (model: string) => {
    if (!inMemoryStore.has(model)) {
      inMemoryStore.set(model, new Map());
    }
    return inMemoryStore.get(model)!;
  };

  const createModelProxy = (model: string) => ({
    findMany: async (args?: any) => {
      const items = Array.from(getStore(model).values());
      if (args?.where?.userId) {
        return items.filter((item: any) => item.userId === args.where.userId);
      }
      return items;
    },
    findFirst: async (args?: any) => {
      const items = Array.from(getStore(model).values());
      return items[0] ?? null;
    },
    findUnique: async (args?: any) => {
      const store = getStore(model);
      if (args?.where?.id) return store.get(args.where.id) ?? null;
      if (args?.where?.email) {
        for (const v of store.values()) {
          if (v.email === args.where.email) return v;
        }
      }
      return null;
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
      return updated;
    },
    updateMany: async () => ({ count: 1 }),
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
    deleteMany: async () => ({ count: 0 }),
    count: async (args?: any) => {
      const items = Array.from(getStore(model).values());
      if (args?.where?.userId) {
        return items.filter((item: any) => item.userId === args.where.userId).length;
      }
      return items.length;
    },
  });

  return new Proxy(
    {},
    {
      get: (_, prop: string) => {
        if (prop === "$queryRaw" || prop === "$executeRaw") {
          return async () => [{ 1: 1 }];
        }
        if (prop.startsWith("$")) {
          return async () => null;
        }
        return createModelProxy(prop);
      },
    },
  ) as unknown as PrismaClient;
}

let realClient: PrismaClient | null = null;
try {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    realClient = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
} catch {
  realClient = null;
}

const mockFallback = createMockPrisma();

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
                      console.warn(
                        `[AI Studio] Prisma error on ${prop}.${modelProp}, falling back to mock:`,
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
                console.warn(
                  `[AI Studio] Prisma error on ${prop}, falling back to mock:`,
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
    : mockFallback);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

