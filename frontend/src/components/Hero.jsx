import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

const TYPE_LINES = [
  "> initializing investigation bureau...",
  "> scanning ChatGPT, Claude, Gemini, Perplexity...",
  "> query: \"best running shoes 2024\"",
  "> brand mention found: NIKE",
  "> evidence logged. confidence 92%",
];

function CRTMonitor() {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [displayedLines, setDisplayedLines] = useState([]);

  useEffect(() => {
    if (lineIndex >= TYPE_LINES.length) {
      const resetTimer = setTimeout(() => {
        setDisplayedLines([]);
        setLineIndex(0);
        setCharIndex(0);
      }, 1800);
      return () => clearTimeout(resetTimer);
    }
    const current = TYPE_LINES[lineIndex];
    if (charIndex < current.length) {
      const t = setTimeout(() => setCharIndex((c) => c + 1), 28);
      return () => clearTimeout(t);
    }
    const nextLineTimer = setTimeout(() => {
      setDisplayedLines((lines) => [...lines, current]);
      setLineIndex((i) => i + 1);
      setCharIndex(0);
    }, 500);
    return () => clearTimeout(nextLineTimer);
  }, [charIndex, lineIndex]);

  const currentPartial = TYPE_LINES[lineIndex]?.slice(0, charIndex) ?? "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
      className="relative mx-auto mt-10 w-full max-w-md"
    >
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-24 w-56 -translate-x-1/2 rounded-full opacity-60 blur-2xl"
        style={{ background: "radial-gradient(ellipse, rgba(232,169,74,0.35), transparent 70%)" }}
      />

      <div
        className="relative rounded-2xl border border-[#3a342a] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]"
        style={{ background: "linear-gradient(160deg, #2a241c, #17140f)" }}
      >
        <div className="relative overflow-hidden rounded-lg border border-black/60 bg-[#0a0e08] p-4 font-mono text-[11px] leading-relaxed text-[#8fd9a8]" style={{ minHeight: 160 }}>
          <motion.div
            className="pointer-events-none absolute inset-x-0 h-8 opacity-20"
            style={{ background: "linear-gradient(180deg, transparent, rgba(143,217,168,0.5), transparent)" }}
            animate={{ y: [0, 160, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0px, transparent 1px, transparent 2px)" }}
          />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]" />

          <div className="relative z-10">
            {displayedLines.map((line, i) => (
              <div key={i} className="opacity-70">{line}</div>
            ))}
            <div>
              {currentPartial}
              <span className="animate-pulse">▊</span>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[9px] font-mono uppercase tracking-widest text-[#6b6048]">
          <span>Bureau Terminal — Unit 04</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bureau-amber animate-pulse" />
            Live
          </span>
        </div>
      </div>

      <div className="mx-auto h-6 w-16 rounded-b-md" style={{ background: "linear-gradient(160deg, #2a241c, #17140f)" }} />
      <div className="mx-auto h-2 w-28 rounded-full" style={{ background: "linear-gradient(160deg, #221e17, #131109)" }} />
    </motion.div>
  );
}

export function Hero({ onBeginInvestigation }) {
  return (
    <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center bureau-grain">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(232,169,74,0.25), transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 mx-auto inline-flex items-center gap-2 rounded-full border border-bureau-border bg-bureau-card px-4 py-1.5 text-xs font-mono uppercase tracking-widest text-bureau-amber"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-bureau-amber animate-pulse" />
        Live signal tracking
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        className="relative z-10 mx-auto mt-6 max-w-3xl font-serif text-4xl font-medium leading-tight text-bureau-text md:text-5xl"
      >
        Every Answer Leaves a Trace.
        <br />
        <span className="text-bureau-amber">We Find It.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        className="relative z-10 mx-auto mt-4 max-w-xl text-base text-bureau-text-muted"
      >
        Track how ChatGPT, Claude, Gemini and Perplexity talk about your brand —
        every citation examined like evidence.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        className="relative z-10 mt-8 flex items-center justify-center gap-3"
      >
        <Button variant="primary" size="lg" onClick={onBeginInvestigation}>
          <Search size={18} />
          Begin Investigation
          <ArrowRight size={16} />
        </Button>
      </motion.div>

      <div className="relative z-10">
        <CRTMonitor />
      </div>
    </section>
  );
}
