"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";

function SignInForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const roleParam = searchParams.get("role") || "student";
  const [role, setRole] = useState<"student" | "lead">(roleParam === "lead" ? "lead" : "student");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync role state with query param if it changes
  useEffect(() => {
    if (roleParam === "lead") {
      setRole("lead");
    } else {
      setRole("student");
    }
  }, [roleParam]);

  const getDemoPassword = () => {
    return role === "lead" ? "lead123" : "kusuma123";
  };

  const getUserName = () => {
    return role === "lead" ? "Jaswanth (Team Lead)" : "Kusuma (Student)";
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const validPasswords = role === "lead" 
      ? ["lead123", "lead", "jaswanth"] 
      : ["kusuma123", "kusuma", "student"];

    setTimeout(() => {
      if (validPasswords.includes(password.trim().toLowerCase())) {
        if (role === "lead") {
          localStorage.setItem("leadLoggedIn", "true");
          router.push("/lead");
        } else {
          localStorage.setItem("studentLoggedIn", "true");
          router.push("/student");
        }
      } else {
        setError("Invalid demo password. Please try again.");
        setIsSubmitting(false);
      }
    }, 600); // Slight delay for realistic feel
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md p-8 glass-card"
    >
      <div className="text-center mb-6">
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ 
            background: role === "lead" ? "var(--gradient-accent)" : "var(--student-gradient)",
            boxShadow: "var(--shadow-glow)" 
          }}
        >
          <span className="text-white font-bold text-xl">
            {role === "lead" ? "JT" : "K"}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Sign In
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Accessing as <span className="font-semibold" style={{ color: role === "lead" ? "var(--accent-primary)" : "var(--student-accent)" }}>{getUserName()}</span>
        </p>
      </div>

      <form onSubmit={handleSignIn} className="space-y-4">
        {/* Role Toggle Switch */}
        <div className="flex p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 relative justify-between">
          <button
            type="button"
            onClick={() => {
              setRole("student");
              setError("");
              setPassword("");
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              role === "student"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
            style={{ cursor: "pointer" }}
          >
            Student Portal
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("lead");
              setError("");
              setPassword("");
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              role === "lead"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
            style={{ cursor: "pointer" }}
          >
            Command Center
          </button>
        </div>

        {/* Username field (Read-only for demo purposes) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
            Username
          </label>
          <input
            type="text"
            value={role === "lead" ? "jaswanth" : "kusuma"}
            disabled
            className="w-full px-4 py-2.5 rounded-xl text-xs bg-gray-100 dark:bg-white/5 border text-gray-500 border-gray-200 dark:border-gray-800"
          />
        </div>

        {/* Password field */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
            Demo Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="glass-input text-xs"
            id="password-input"
            autoFocus
          />
        </div>

        {error && (
          <p className="text-[11px] font-medium text-red-500 text-center animate-pulse">
            ⚠️ {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-xl text-white font-medium text-xs transition-all shadow-md flex items-center justify-center gap-2"
          style={{
            background: role === "lead" ? "var(--gradient-accent)" : "var(--student-gradient)",
            cursor: "pointer",
          }}
          id="signin-btn"
        >
          {isSubmitting ? (
            <span>Signing in...</span>
          ) : (
            <>
              <span>Sign In</span>
              <span>→</span>
            </>
          )}
        </button>
      </form>

      {/* Demo Credentials Box */}
      <div className="mt-6 p-3 rounded-xl border bg-black/5 dark:bg-white/5 border-dashed border-gray-300 dark:border-gray-700 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
          Demo Hint
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Use password <code className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[11px] font-bold text-indigo-500">{getDemoPassword()}</code>
        </p>
      </div>
    </motion.div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4" style={{ background: "var(--bg-primary)" }}>
      <Suspense fallback={
        <div className="text-xs font-semibold animate-pulse" style={{ color: "var(--text-secondary)" }}>
          Loading session...
        </div>
      }>
        <SignInForm />
      </Suspense>
    </div>
  );
}
