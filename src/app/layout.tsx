import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://educhat.bahroun.me"),
  title: {
    default: "EduChat",
    template: "%s · EduChat",
  },
  description:
    "EduChat is a UX-first messaging experience inspired by iMessage clarity and modern social chat flow.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "EduChat",
    description:
      "A polished, modern messaging experience designed for focus, connection, and retention.",
    url: "https://educhat.bahroun.me",
    siteName: "EduChat",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
