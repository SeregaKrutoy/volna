import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "volna — музыка в вашем ритме",
  description: "Слушайте музыку с устройства, открывайте независимых исполнителей и создавайте свои плейлисты.",
  icons: {
    icon: [{ url: "/images/wave-icon.svg", type: "image/svg+xml" }],
    shortcut: "/images/wave-icon.svg",
    apple: "/images/wave-icon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
