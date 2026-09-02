"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
};

const employeeNavigation: NavigationItem[] = [
  { href: "/", label: "Ringkasan", shortLabel: "RK" },
  { href: "/absensi", label: "Absensi", shortLabel: "AB" },
  { href: "/cuti", label: "Daftar cuti", shortLabel: "CT" }
];

const adminNavigation: NavigationItem[] = [
  { href: "/admin", label: "Dashboard admin", shortLabel: "DA" },
  { href: "/admin/roster", label: "Kalender roster", shortLabel: "KR" },
  { href: "/admin/karyawan", label: "Data karyawan", shortLabel: "DK" },
  { href: "/admin/pengaturan-jam", label: "Pengaturan jam", shortLabel: "PJ" },
  { href: "/admin/perangkat", label: "Perangkat X105", shortLabel: "X1" }
];

function isCurrentPath(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationGroup({
  title,
  items,
  pathname,
  onNavigate
}: {
  title: string;
  items: NavigationItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="nav-group" aria-label={title}>
      <p className="nav-title">{title}</p>
      {items.map((item) => {
        const active = isCurrentPath(pathname, item.href);
        return (
          <Link
            className={`nav-link${active ? " nav-link-active" : ""}`}
            href={item.href}
            key={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <span className="nav-mark" aria-hidden="true">{item.shortLabel}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-mark" aria-hidden="true">A</span>
      <span>
        <strong>ABSENKITA</strong>
        <small>Operasional Sangatta</small>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-navigation">
          <NavigationGroup title="Karyawan" items={employeeNavigation} pathname={pathname} />
          <NavigationGroup title="Administrasi" items={adminNavigation} pathname={pathname} />
        </div>
        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">PE</span>
          <span>
            <strong>Pandu Eka</strong>
            <small>Supervisor</small>
          </span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <details className="mobile-menu">
            <summary>Menu</summary>
            <div className="mobile-menu-panel">
              <Brand />
              <NavigationGroup title="Karyawan" items={employeeNavigation} pathname={pathname} />
              <NavigationGroup title="Administrasi" items={adminNavigation} pathname={pathname} />
            </div>
          </details>
          <div className="topbar-context">
            <strong>Site Sangatta</strong>
            <span>WITA</span>
          </div>
          <div className="topbar-user">
            <span className="semantic-dot semantic-dot-online" aria-hidden="true" />
            Sistem aktif
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
