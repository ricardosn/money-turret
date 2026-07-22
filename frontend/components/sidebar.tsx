"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Menu,
  Receipt,
  Tags,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: Receipt },
  { href: "/categorize", label: "Categorização", icon: Tags },
  { href: "/upload", label: "Upload", icon: Upload },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}): ReactNode {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
              }`}
            >
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar(): ReactNode {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-800 bg-slate-900/40 md:flex md:flex-col">
        <div className="flex items-center gap-2 px-4 py-5">
          <span className="text-lg font-semibold tracking-tight text-white">
            Money Turret
          </span>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 px-3 py-2">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="px-4 py-4 text-xs text-slate-500">
          Análise financeira · Nubank
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3 md:hidden">
        <span className="text-base font-semibold tracking-tight text-white">
          Money Turret
        </span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
          aria-label="Abrir menu de navegação"
          className="focus-ring rounded-md border border-slate-700 p-2 text-slate-200 hover:bg-slate-800"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu de navegação"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navegação principal"
            className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900 shadow-xl"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-base font-semibold text-white">
                Money Turret
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Navegação principal" className="flex-1 px-3">
              <NavLinks
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
