"use client";

import { sanitizeAmountInput } from "@/lib/positiveAmount";

interface AmountInputProps {
  amount: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export const AmountInput = ({
  amount,
  onChange,
  readOnly = false,
}: AmountInputProps) => (
  <div className="rounded-xl border border-border bg-secondary p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:rounded-xl sm:p-4 lg:p-2.5 xl:p-3">
    <input
      type="text"
      value={`$${amount}`}
      onChange={
        onChange
          ? (e) => onChange(sanitizeAmountInput(e.target.value))
          : undefined
      }
      readOnly={readOnly}
      className="w-full bg-transparent text-center text-[2.35rem] font-semibold tracking-tight text-foreground outline-none sm:text-[2.8rem] lg:text-[2.2rem] xl:text-[2.35rem]"
    />
  </div>
);
