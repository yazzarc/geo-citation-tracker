import { motion } from "framer-motion";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-bureau)] font-medium font-sans transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-bureau-amber text-bureau-bg hover:bg-bureau-gold shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_rgba(232,169,74,0.45)]",
        secondary:
          "bg-bureau-surface text-bureau-text border border-bureau-border hover:border-bureau-amber/50 hover:text-bureau-amber",
        ghost:
          "bg-transparent text-bureau-text-muted hover:text-bureau-text hover:bg-bureau-surface/60",
        outline:
          "bg-transparent border border-bureau-amber/40 text-bureau-amber hover:bg-bureau-amber/10",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export function Button({ className, variant, size, children, ...props }) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ y: 0, scale: 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}
