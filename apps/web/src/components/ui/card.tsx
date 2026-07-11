import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-lg border border-slate-200 bg-white p-5 shadow-soft", className)} {...props} />
);
