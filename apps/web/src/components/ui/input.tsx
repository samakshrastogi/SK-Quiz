import type { InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-ink focus:ring-2 focus:ring-ink/10",
      className
    )}
    {...props}
  />
);
