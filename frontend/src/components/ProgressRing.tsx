"use client";

import { motion } from "framer-motion";

interface ProgressRingProps {
  progress: number;     // 0-100
  size?: number;         // diameter in px
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  showLabel?: boolean;
  label?: string;
}

export default function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 5,
  color = "#6366f1",
  bgColor = "rgba(255, 255, 255, 0.06)",
  showLabel = true,
  label,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
            {Math.round(progress)}%
          </span>
          {label && (
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
