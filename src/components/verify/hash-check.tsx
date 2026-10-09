"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Outcome = { kind: "match"; version: number } | { kind: "mismatch"; sha256: string } | null;

/** Hashes a user-picked file with WebCrypto and compares it against the stored versions. */
export function HashCheck({ hashes }: { hashes: { version: number; sha256: string }[] }) {
  const t = useTranslations("verify.check");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);

  async function check(file: File) {
    setBusy(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const match = hashes.find((h) => h.sha256 === hex);
      setOutcome(
        match ? { kind: "match", version: match.version } : { kind: "mismatch", sha256: hex },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <label className="text-app-label text-ink-subtle" htmlFor="verify-file">
        {t("label")}
      </label>
      <input
        id="verify-file"
        type="file"
        accept="application/pdf"
        disabled={busy || hashes.length === 0}
        className="text-app-caption text-ink-subtle file:mr-2 file:h-7 file:rounded-md file:border file:border-hairline file:bg-surface-1 file:px-3 file:text-app-caption file:text-ink"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void check(f);
        }}
      />
      {busy ? <p className="text-app-caption text-ink-subtle">{t("hashing")}</p> : null}
      {outcome?.kind === "match" ? (
        <p role="status" className="text-app-body text-semantic-success">
          {t("match", { version: outcome.version })}
        </p>
      ) : outcome?.kind === "mismatch" ? (
        <p role="alert" className="text-app-body text-semantic-danger">
          {t("mismatch")}
          <span className="block text-app-mono break-all text-ink-subtle">{outcome.sha256}</span>
        </p>
      ) : null}
    </div>
  );
}
