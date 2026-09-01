import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./request-flow.css";
import "./topology-map.css";
import "./dense-ui.css";
import "./development-workbench.css";
import "./development-workbench-accessibility.css";
import "./mobile.css";
import "./living-system-board.css";
import "./living-system-details.css";
import "./living-system-report.css";

export const metadata: Metadata = {
  title: "Dev to Scale",
  description: "Build it. Ship it. Keep it alive. Scale it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
