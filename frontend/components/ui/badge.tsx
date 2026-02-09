import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-900 text-white",
        secondary: "border-transparent bg-surface-raised text-foreground dark:bg-white/[0.08] dark:text-slate-300",
        success: "border-transparent bg-success-light text-success-dark dark:bg-emerald-500/15 dark:text-emerald-400",
        danger: "border-transparent bg-danger-light text-danger-dark dark:bg-red-500/15 dark:text-red-400",
        warning: "border-transparent bg-warning-light text-warning-dark dark:bg-amber-500/15 dark:text-amber-400",
        info: "border-transparent bg-info-light text-info-dark dark:bg-blue-500/15 dark:text-blue-400",
        outline: "border-surface-border text-foreground dark:border-white/15 dark:text-slate-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
