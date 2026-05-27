import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jaswanth Digital Twin",
  description:
    "Autonomous agentic framework emulating the team lead for task evaluation and tonal communication.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
