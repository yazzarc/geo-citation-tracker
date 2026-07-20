import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeStyles = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium font-mono uppercase tracking-wide",
  {
    variants: {
      variant: {
        gold: "bg-bureau-gold-soft text-bureau-gold border border-bureau-gold/30",
        amber: "bg-bureau-amber-soft text-bureau-amber border border-bureau-amber/30",
        success: "bg-[rgba(111,174,124,0.12)] text-bureau-success border border-[rgba(111,174,124,0.3)]",
        danger: "bg-[rgba(180,76,67,0.12)] text-bureau-copper border border-[rgba(180,76,67,0.3)]",
        neutral: "bg-bureau-surface text-bureau-text-muted border border-bureau-border",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export function Badge({ className, variant, children, ...props }) {
  return (
    <span className={cn(badgeStyles({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
