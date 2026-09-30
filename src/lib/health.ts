export type Readiness = {
  status: 200 | 503;
  body: { ok: boolean; db: "ok" | "timeout" | "error" };
};

/** Runs `probe` with a hard time budget so a wedged database yields a fast 503 instead of a hung request. */
export async function checkReadiness(
  probe: () => Promise<unknown>,
  timeoutMs: number,
): Promise<Readiness> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const outcome = await Promise.race([probe().then(() => "ok" as const), timeout]);
    return outcome === "ok"
      ? { status: 200, body: { ok: true, db: "ok" } }
      : { status: 503, body: { ok: false, db: "timeout" } };
  } catch {
    return { status: 503, body: { ok: false, db: "error" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
