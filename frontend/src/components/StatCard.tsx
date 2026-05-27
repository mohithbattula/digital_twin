"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  variant?: "accent" | "success" | "warning" | "danger";
  suffix?: string;
  delay?: number;
}

export default function StatCard({
  label,
  value,
  icon,
  variant = "accent",
  suffix = "",
  delay = 0,
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplayValue(0);
      return;
    }
    const duration = 800;
    const steps = 30;
    const stepDuration = duration / steps;
    let current = 0;
    const increment = value / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(current));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={`stat-card stat-card-${variant}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {displayValue}
        </span>
        {suffix && (
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {suffix}
          </span>
        )}
      </div>
    </motion.div>
  );
}
