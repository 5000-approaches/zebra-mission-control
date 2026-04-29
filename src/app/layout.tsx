import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SchemeProvider } from "@/components/scheme-provider";
import { ModeProvider } from "@/components/mode-provider";
import { DEFAULT_SCHEME, SCHEME_STORAGE_KEY, DEFAULT_MODE, MODE_STORAGE_KEY } from "@/lib/schemes";
import AppShell from "./AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zebra Mission Control",
  description: "Project management hub for Zebra Consulting",
};

const flashScript = `
try {
  var s = localStorage.getItem(${JSON.stringify(SCHEME_STORAGE_KEY)});
  if (s) document.documentElement.setAttribute('data-scheme', s);
  else document.documentElement.setAttribute('data-scheme', ${JSON.stringify(DEFAULT_SCHEME)});
  var m = localStorage.getItem(${JSON.stringify(MODE_STORAGE_KEY)});
  if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-mode', m);
  else document.documentElement.setAttribute('data-mode', ${JSON.stringify(DEFAULT_MODE)});
} catch(e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full`}
      data-scheme={DEFAULT_SCHEME}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: flashScript }} />
      </head>
      <body className="min-h-full" style={{ backgroundColor: "var(--page-bg)", color: "var(--page-text)" }}>
        <SchemeProvider>
          <ModeProvider>
            <AppShell>{children}</AppShell>
          </ModeProvider>
        </SchemeProvider>
      </body>
    </html>
  );
}
