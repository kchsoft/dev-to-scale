import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./request-flow.css";
import "./dense-ui.css";

export const metadata: Metadata = {
  title: "Dev to Scale",
  description: "Build it. Ship it. Keep it alive. Scale it.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
