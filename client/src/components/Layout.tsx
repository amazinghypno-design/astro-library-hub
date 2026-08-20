import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { IconCategory, IconHome, IconLibrary, IconSearch } from "./icons";
import LogoMark from "./LogoMark";

const NAV_LINKS = [
  { to: "/", label: "หน้าแรก", Icon: IconHome },
  { to: "/search", label: "ค้นหา", Icon: IconSearch },
  { to: "/library", label: "คลัง", Icon: IconLibrary },
  { to: "/categories", label: "หมวดหมู่", Icon: IconCategory },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";

  // Installed as a home-screen app the page owns the whole screen, notch and
  // home indicator included, so the bar and the page floor pad themselves out
  // of the way. Both insets are 0 in a browser tab and on a plain screen.
  return (
    <div className="min-h-screen flex flex-col bg-ivory pb-[env(safe-area-inset-bottom)]">
      <header className="bg-navy-950 text-ivory sticky top-0 z-10 shadow-lg shadow-navy-950/10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <LogoMark className="text-gold-400 shrink-0 transition-transform group-hover:scale-110" width={30} height={16} />
            <span className="font-serif font-semibold text-base sm:text-xl text-ivory tracking-wide">
              <span className="hidden sm:inline">Astro Library </span>
              <span className="text-gold-400">Hub</span>
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-2 text-sm">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-label={link.label}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors font-medium ${
                  location.pathname === link.to
                    ? "bg-white/10 text-gold-400"
                    : "text-ivory/75 hover:text-gold-400 hover:bg-white/5"
                }`}
              >
                <link.Icon width={18} height={18} className="shrink-0" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {!isHome && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-navy-700 hover:text-gold-600 font-medium px-3 py-2 -ml-3 rounded-lg transition-colors"
          >
            <span aria-hidden>←</span> กลับหน้าแรก
          </Link>
        </div>
      )}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-navy-900/10 py-8 text-center text-sm text-navy-700/60">
        <span className="text-gold-600/80 mr-1.5">✦</span>
        Astro Library Hub — คลังความรู้โหราศาสตร์สาธารณะ
      </footer>
    </div>
  );
}
