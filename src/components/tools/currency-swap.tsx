"use client";

import { ArrowDownUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Amount, Mono } from "@/components/ui/mono";
import { Select } from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import { convert, type RateTableWithSource } from "@/lib/rates";
import { cn } from "@/lib/utils";

/**
 * Tools → Currency (addendum §5): the beui swap block's shape (two stacked fields, a flip button
 * between them, the quote line underneath) adapted to currencies, with every string translated
 * and the conversion done by `convert()` in Decimal. The table arrives from the server.
 */
export function CurrencySwap({
  table,
  defaultFrom,
  defaultTo,
  locale,
}: {
  table: RateTableWithSource;
  defaultFrom: string;
  defaultTo: string;
  locale: string;
}) {
  const t = useTranslations("tools.currency");
  const reduce = useReducedMotion();
  const id = useId();
  const currencies = useMemo(() => Object.keys(table.rates).sort(), [table.rates]);
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState(currencies.includes(defaultFrom) ? defaultFrom : "USD");
  const [to, setTo] = useState(currencies.includes(defaultTo) ? defaultTo : "USD");
  const [turns, setTurns] = useState(0);

  const parsed = /^\d+(\.\d+)?$/.test(amount.trim()) ? D(amount.trim()) : null;
  const result = parsed ? convert(parsed, from, to, table) : null;
  const unit = convert("1", from, to, table);

  const flip = () => {
    setTurns((n) => n + 1);
    setFrom(to);
    setTo(from);
  };

  const row = (
    side: "from" | "to",
    currency: string,
    onCurrency: (c: string) => void,
    field: React.ReactNode,
  ) => (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-3">
      <label htmlFor={`${id}-${side}-currency`} className="text-app-caption text-ink-subtle">
        {t(side)}
      </label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{field}</div>
        <Select
          id={`${id}-${side}-currency`}
          name={side}
          value={currency}
          onChange={(e) => onCurrency(e.target.value)}
          className="w-28 shrink-0 font-mono"
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );

  return (
    <div data-currency-swap className="flex w-full max-w-md flex-col gap-1.5">
      {row(
        "from",
        from,
        setFrom,
        <Input
          id={`${id}-amount`}
          name="amount"
          inputMode="decimal"
          aria-label={t("amount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={parsed ? undefined : true}
          className="font-mono"
        />,
      )}
      <div className="relative z-10 -my-4 flex justify-center">
        <motion.button
          type="button"
          onClick={flip}
          aria-label={t("flip")}
          animate={{ rotate: turns * 180 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24 }}
          className={cn(
            "flex size-9 items-center justify-center rounded-full border border-hairline-strong bg-surface-2 text-ink shadow-sm transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          <ArrowDownUp aria-hidden className="size-4" strokeWidth={1.5} />
        </motion.button>
      </div>
      {row(
        "to",
        to,
        setTo,
        <output
          htmlFor={`${id}-amount`}
          data-result
          aria-live="polite"
          className="block min-h-9 truncate px-1 py-1.5 text-app-section"
        >
          {result ? (
            <Amount>{formatMoney(result.toString(), to, locale)}</Amount>
          ) : (
            <span className="text-ink-subtle">{t("enterAmount")}</span>
          )}
        </output>,
      )}
      <p className="mt-2 flex flex-col gap-0.5 text-app-caption text-ink-subtle">
        <span>
          <Mono>1 {from}</Mono> = <Mono>{formatMoney(unit.toString(), to, locale)}</Mono>
        </span>
        <span data-rates-as-of>
          {t("asOf", {
            date: formatDate(table.asOf, locale),
            source: t(`sources.${table.source}`),
          })}
        </span>
      </p>
    </div>
  );
}
