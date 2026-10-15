import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * Typography for the legal pages (spec §6.3-6.4): a titled document with an effective date, a
 * table of contents built from the sections, numbered sections, and print-friendly spacing.
 */
export interface LegalSectionDef {
  id: string;
  title: string;
}

export function LegalDoc({
  title,
  summary,
  effectiveDate,
  sections,
  children,
}: {
  title: string;
  summary?: ReactNode;
  effectiveDate?: string | undefined;
  sections: LegalSectionDef[];
  children: ReactNode;
}) {
  const t = useTranslations("legalChrome.doc");
  return (
    <article className="legal-doc mx-auto w-full max-w-3xl">
      <header className="mb-8">
        <h1 className="text-app-title text-ink">{title}</h1>
        {effectiveDate ? (
          <p className="mt-1 text-app-caption text-ink-subtle">
            {t.rich("effectiveOn", {
              date: effectiveDate,
              mono: (chunks) => <span className="app-mono">{chunks}</span>,
            })}
          </p>
        ) : null}
        {summary ? <p className="mt-4 text-app-body text-ink-subtle">{summary}</p> : null}
      </header>
      <Toc sections={sections} />
      <div className="flex flex-col gap-8">{children}</div>
    </article>
  );
}

export function Toc({ sections }: { sections: LegalSectionDef[] }) {
  const t = useTranslations("legalChrome.toc");
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label={t("label")}
      className="mb-8 rounded-lg border border-hairline bg-surface-1 p-4 print:hidden"
    >
      <ol className="grid gap-1 text-app-body sm:grid-cols-2">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="text-link underline-offset-4 hover:underline">
              {i + 1}. {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 text-app-section text-ink">
        {number}. {title}
      </h2>
      <div className="flex flex-col gap-3 text-app-body text-ink-subtle [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
