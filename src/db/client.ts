import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";
import { getRuntimeContext } from "../runtime.js";

let nodePrisma: PrismaClient | null = null;

export function getPrismaClient() {
  const runtimePrisma = getRuntimeContext()?.prisma;
  if (runtimePrisma) {
    return runtimePrisma;
  }

  process.env.DATABASE_URL ??= config.databaseUrl;
  process.env.DIRECT_URL ??= config.directUrl;

  nodePrisma ??= new PrismaClient();
  return nodePrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property: keyof PrismaClient) {
    const client = getPrismaClient();
    const value = client[property];

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  },
});
