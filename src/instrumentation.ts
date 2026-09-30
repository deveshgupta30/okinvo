/** Runs once at server start, so a bad .env stops the process instead of 500-ing every request. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ validateEnv }, { validateAtBoot }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/boot"),
  ]);
  validateAtBoot(
    validateEnv,
    (code) => process.exit(code),
    (message) => console.error(message),
  );

  // Warm the database client so the first readiness probe is not also the first connection.
  // Best effort: the database may legitimately come up after the app (compose restarts).
  const { prisma } = await import("@/lib/db");
  await prisma.$connect().catch((error: unknown) => {
    console.error("database warm-up failed; readiness will report it until it recovers", error);
  });
}
