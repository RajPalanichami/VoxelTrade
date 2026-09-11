import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AuthUiProvider } from "@/components/providers/AuthUiProvider";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({ subsets: ["latin"] });

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("pro-trader-theme");if(t!=="light")t="dark";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export const metadata: Metadata = {
  title: "Voxel Trading — A Voxel AI Lab Product",
  description: "Multi-timeframe stock signal and trading analysis platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <Script id="theme-boot" strategy="beforeInteractive">
          {THEME_BOOT}
        </Script>
        <ThemeProvider>
          <AuthProvider>
            <AuthUiProvider>
              <QueryProvider>
                <AppShell>{children}</AppShell>
              </QueryProvider>
            </AuthUiProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
