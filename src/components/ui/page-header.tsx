"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/motion/breadcrumb";

export interface Crumb {
  href: string;
  label: string;
}

/** 48px breadcrumb + actions row at the top of every screen (v2 §24.5 density). */
export function PageHeader({
  title,
  description,
  breadcrumb = [],
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const t = useTranslations("ui");
  return (
    <div className="mb-6 flex flex-col gap-2">
      {breadcrumb.length > 0 ? (
        <Breadcrumb aria-label={t("breadcrumb")} className="flex h-5 items-center text-app-caption">
          <BreadcrumbList overflowLabel={t("breadcrumb")} className="gap-1 text-app-caption">
            {breadcrumb.map((c, i) => (
              <BreadcrumbItem key={c.href} className="inline-flex items-center gap-1">
                {i > 0 ? (
                  <BreadcrumbSeparator>
                    <ChevronRight
                      aria-hidden
                      className="size-3 text-ink-tertiary"
                      strokeWidth={1.5}
                    />
                  </BreadcrumbSeparator>
                ) : null}
                <BreadcrumbLink
                  className="text-ink-subtle hover:text-ink"
                  render={({ className, children }) => (
                    <Link href={c.href} className={className ?? ""}>
                      {children}
                    </Link>
                  )}
                >
                  {c.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-center gap-3 text-app-title text-ink">{title}</h1>
          {description ? <p className="text-app-body text-ink-subtle">{description}</p> : null}
          {meta ? <div className="text-app-caption text-ink-subtle">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
