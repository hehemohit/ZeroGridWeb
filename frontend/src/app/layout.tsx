import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "ZeroGrid — Emergency Rescue Network",
  description:
    "ZeroGrid is an offline-first emergency mesh network and rescue coordination platform. Works without internet via BLE & Wi-Fi Direct, and escalates SOS alerts online when connected.",
  keywords: ["emergency", "rescue", "SOS", "mesh network", "offline", "safety"],
  openGraph: {
    title: "ZeroGrid — Emergency Rescue Network",
    description: "Offline-first emergency mesh network and rescue coordination platform.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      {/*
        bg-canvas / text-primaryText use CSS variables defined in globals.css.
        When ThemeProvider adds .light to <html>, those variables switch automatically.
      */}
      <body className="bg-canvas text-primaryText antialiased transition-colors duration-300">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
