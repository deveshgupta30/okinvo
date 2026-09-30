/** Runs once at server start, so a bad .env stops the process instead of 500-ing every request. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ validateEnv }, { validateAtBoot }] = await Promise.all([
      import("@/lib/env"),
      import("@/lib/boot"),
    ]);
    validateAtBoot(
      validateEnv,
      (code) => process.exit(code),
      (message) => console.error(message),
    );
  }
}
