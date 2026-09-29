import type { Metadata } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { loadCurrentState } from "@/lib/session";
import { KitsuneProvider } from "@/lib/store";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "KitsuneSync",
    template: "%s · KitsuneSync",
  },
  description:
    "Sync your AniList anime and manga, track your physical manga shelf volume by volume, and get a wishlist that fills itself.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const state = await loadCurrentState();
  return (
    <html lang="en" className={`${chakra.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <KitsuneProvider initial={state}>
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">{children}</main>
        </KitsuneProvider>
        <footer className="border-t border-line/60 py-6 text-center font-mono text-[11px] text-mute">
          KitsuneSync · list data from{" "}
          <a href="https://anilist.co" className="text-neon-cyan hover:underline" target="_blank" rel="noreferrer">
            AniList
          </a>{" "}
          · your shelf lives on this server
        </footer>
      </body>
    </html>
  );
}
