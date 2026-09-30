export type ReadinessFailure = "timeout" | "error";
export type Readiness = {
  status: 200 | 503;
  body: { ok: boolean; db: "ok" | ReadinessFailure };
};

/**
 * Runs `probe` with a hard time budget so a wedged database yields a fast 503 instead of a hung
 * request. The cause is handed to `onFailure` so the route can log it — the response body stays
 * generic on purpose.
 */
export async function checkReadiness(
  probe: () => Promise<unknown>,
  timeoutMs: number,
  onFailure?: (cause: ReadinessFailure, error?: unknown) => void,
): Promise<Readiness> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const outcome = await Promise.race([probe().then(() => "ok" as const), timeout]);
    if (outcome === "ok") return { status: 200, body: { ok: true, db: "ok" } };
    onFailure?.("timeout", undefined);
    return { status: 503, body: { ok: false, db: "timeout" } };
  } catch (error) {
    onFailure?.("error", error);
    return { status: 503, body: { ok: false, db: "error" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
