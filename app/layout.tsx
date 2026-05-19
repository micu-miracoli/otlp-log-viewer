import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OTLP Log Viewer",
  description: "Visualize OTLP log records by severity, time, and service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // `dark` forces Tailwind's dark-mode variants — app is always dark.
      className={`${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="h-full overflow-hidden flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
