/**
 * Runs a validation at server start and terminates the process if it throws.
 * Next's production server only logs a failing instrumentation hook and then answers every
 * request with 500; SPEC §4.1 wants the app to refuse to start, and a restart loop is the
 * signal operators actually see.
 */
export function validateAtBoot(
  validate: () => unknown,
  exit: (code: number) => never,
  log: (message: string) => void,
): void {
  try {
    validate();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`okinvo refused to start: ${reason}`);
    exit(1);
  }
}
