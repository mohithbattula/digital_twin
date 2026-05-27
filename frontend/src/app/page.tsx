"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4" style={{ background: "var(--bg-primary)" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center max-w-lg"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center"
          style={{ background: "var(--gradient-accent)", boxShadow: "var(--shadow-glow)" }}
        >
          <span className="text-white font-bold text-2xl">JT</span>
        </motion.div>

        <h1 className="text-3xl font-bold tracking-tight gradient-text mb-2">
          Jaswanth Digital Twin
        </h1>
        <p className="text-sm mb-10" style={{ color: "var(--text-secondary)" }}>
          Autonomous task evaluation and team communication platform
        </p>

        {/* Role Selection */}
        <div className="grid gap-4 sm:grid-cols-2 max-w-md mx-auto">
          <Link href="/signin?role=student">
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="card-premium p-6 text-center cursor-pointer"
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: "var(--student-gradient)" }}
              >
                <span className="text-2xl">📚</span>
              </div>
              <h2 className="text-sm font-bold mb-1 gradient-text-success">Student Portal</h2>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                View tasks, submit work, track progress
              </p>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
                  <span className="text-[10px] font-bold" style={{ color: "#34d399" }}>K</span>
                </div>
                <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Kusuma</span>
              </div>
            </motion.div>
          </Link>

          <Link href="/signin?role=lead">
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="card-premium p-6 text-center cursor-pointer"
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: "var(--gradient-accent)" }}
              >
                <span className="text-2xl">🎯</span>
              </div>
              <h2 className="text-sm font-bold mb-1 gradient-text">Command Center</h2>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Review tasks, approve work, monitor progress
              </p>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(99, 102, 241, 0.15)" }}>
                  <span className="text-[10px] font-bold" style={{ color: "#a5b4fc" }}>J</span>
                </div>
                <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Jaswanth</span>
              </div>
            </motion.div>
          </Link>
        </div>
      </motion.div>

      {/* Subtle footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        Powered by LangGraph · Supabase · Next.js
      </motion.p>
    </div>
  );
}
