/**
 * Constants shared by the admin session layer and `proxy.ts`.
 *
 * Kept dependency-free on purpose: proxy runs before render and should not pull
 * in Prisma, bcrypt or the `server-only` boundary just to learn a cookie name.
 */

export const SESSION_COOKIE = "sde_admin_session";

/** Admin session lifetime: 8 hours. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
