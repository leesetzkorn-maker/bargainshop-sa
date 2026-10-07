import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the whole server process.
 *
 * In development Next.js hot-reloads modules, which would otherwise open a new
 * connection pool on every save until the database refuses new connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
