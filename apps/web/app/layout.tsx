import type { Metadata } from "next";
import { AppShell } from "./components/app-shell";
import "./styles.css";

export const metadata: Metadata = {
  title: {
    default: "AbsenKita",
    template: "%s | AbsenKita"
  },
  description: "Sistem absensi, roster, on-call, dan sinkronisasi Solution X105"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
