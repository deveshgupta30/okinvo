import "server-only";
import pino, { type Logger } from "pino";
import { env } from "@/lib/env";
import { lazyProxy } from "@/lib/lazy";

/** JSON logs to stdout with PII redacted (v2 §20). Lazy so importing it never reads env. */
export const logger: Logger = lazyProxy(() =>
  pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        "*.password",
        "*.token",
        "*.email",
        "*.authorization",
        "req.headers.cookie",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
    base: { app: "okinvo" },
  }),
);
