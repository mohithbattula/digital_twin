import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Student Dashboard — Jaswanth Digital Twin",
  description: "View and complete your assigned tasks, track progress, and communicate with the digital twin.",
};

export default function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
