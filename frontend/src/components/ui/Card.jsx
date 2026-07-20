import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Card({ className, hover = true, children, ...props }) {
  return (
    <motion.div
      whileHover={hover ? { y: -3 } : undefined}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "rounded-[var(--radius-bureau-lg)] border border-bureau-border bg-bureau-card p-6",
        "shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]",
        hover && "hover:border-bureau-amber/30 hover:shadow-[0_12px_32px_-16px_rgba(232,169,74,0.25)]",
        "transition-shadow",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn("mb-4 flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn("font-serif text-lg text-bureau-text", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn("text-sm text-bureau-text-muted", className)} {...props}>
      {children}
    </p>
  );
}
