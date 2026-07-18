import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => {
  const prismaInstances: PrismaClientMock[] = [];
  const adapterInstances: PrismaPgMock[] = [];

  class PrismaPgMock {
    readonly config: unknown;
    readonly options: unknown;

    constructor(config: unknown, options?: unknown) {
      this.config = config;
      this.options = options;
      adapterInstances.push(this);
    }
  }

  class PrismaClientMock {
    readonly options: unknown;
    readonly $disconnect = vi.fn(async () => {});

    constructor(options: unknown) {
      this.options = options;
      prismaInstances.push(this);
    }
  }

  return {
    adapterInstances,
    PrismaClientMock,
    prismaInstances,
    PrismaPgMock
  };
});

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: prismaMocks.PrismaPgMock
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: prismaMocks.PrismaClientMock
}));

afterEach(() => {
  prismaMocks.adapterInstances.length = 0;
  prismaMocks.prismaInstances.length = 0;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Cloudflare runtime Prisma lifecycle", () => {
  it("creates and disconnects a request-scoped Prisma client for each Worker invocation", async () => {
    const { getRuntimeContext, runWithRuntimeContext } = await import("../runtime.js");
    const env = {
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      NODE_ENV: "test"
    };
    const seenClients: unknown[] = [];

    await runWithRuntimeContext(env, undefined, async () => {
      seenClients.push(getRuntimeContext()?.prisma);
    });
    await runWithRuntimeContext(env, undefined, async () => {
      seenClients.push(getRuntimeContext()?.prisma);
    });

    expect(seenClients[0]).not.toBe(seenClients[1]);
    expect(prismaMocks.prismaInstances).toHaveLength(2);
    expect(prismaMocks.prismaInstances[0].$disconnect).toHaveBeenCalledTimes(1);
    expect(prismaMocks.prismaInstances[1].$disconnect).toHaveBeenCalledTimes(1);
    expect(prismaMocks.adapterInstances[0].config).toMatchObject({
      connectionString: env.DATABASE_URL,
      max: 1
    });
  });

  it("disconnects the request-scoped Prisma client when the callback throws", async () => {
    const { runWithRuntimeContext } = await import("../runtime.js");
    const failure = new Error("boom");

    await expect(
      runWithRuntimeContext(
        {
          DATABASE_URL: "postgres://user:pass@localhost:5432/failing",
          NODE_ENV: "test"
        },
        undefined,
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);

    expect(prismaMocks.prismaInstances).toHaveLength(1);
    expect(prismaMocks.prismaInstances[0].$disconnect).toHaveBeenCalledTimes(1);
  });

  it("uses the Hyperdrive connection string when DATABASE_URL is not present in the Worker env", async () => {
    const { createAppConfig } = await import("../runtime.js");

    // createAppConfig falls back to process.env, which the npm-test wrapper
    // populates with the test database URLs; the Worker env must win here.
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DIRECT_URL", undefined);

    const config = createAppConfig({
      HYPERDRIVE: {
        connectionString: "postgres://hyperdrive/user-db"
      },
      NODE_ENV: "test"
    });

    expect(config.databaseUrl).toBe("postgres://hyperdrive/user-db");
    expect(config.directUrl).toBe("postgres://hyperdrive/user-db");
  });
});
