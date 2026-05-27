import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Command Center — Jaswanth Digital Twin",
  description: "Review student submissions, approve or reject tasks, monitor team progress, and manage weekly plans.",
};

export default function LeadLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
