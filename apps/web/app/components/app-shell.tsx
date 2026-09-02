"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type AuthUser = {
  employeeId: number;
  employeeCode: string;
  name: string;
  email: string | null;
  role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
  { href: "/admin/kehadiran", label: "Verifikasi absensi", shortLabel: "VA" },
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
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (pathname === "/login") return;
    const controller = new AbortController();
    void fetch(`${API_URL}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) {
        window.location.replace("/login");
        return;
      }
      const payload = await response.json() as { user: AuthUser };
      setUser(payload.user);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setUser(null);
    });
    return () => controller.abort();
  }, [pathname]);

  if (pathname === "/login") return <>{children}</>;

  if (user === undefined) {
    return (
      <main className="auth-loading" aria-live="polite">
        <div className="auth-loading-mark">A</div>
        <p>Memeriksa sesi...</p>
      </main>
    );
  }

  if (user === null) {
    return (
      <main className="auth-loading" role="alert">
        <div className="auth-loading-mark">!</div>
        <p>API tidak dapat dihubungi. Pastikan Bun berjalan pada {API_URL}.</p>
      </main>
    );
  }

  const initials = user.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const logout = async () => {
    await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
    window.location.replace("/login");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-navigation">
          <NavigationGroup title="Karyawan" items={employeeNavigation} pathname={pathname} />
          {user.role === "ADMIN" && <NavigationGroup title="Administrasi" items={adminNavigation} pathname={pathname} />}
        </div>
        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </span>
          <button className="logout-button" type="button" onClick={logout}>Keluar</button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <details className="mobile-menu">
            <summary>Menu</summary>
            <div className="mobile-menu-panel">
              <Brand />
              <NavigationGroup title="Karyawan" items={employeeNavigation} pathname={pathname} />
              {user.role === "ADMIN" && <NavigationGroup title="Administrasi" items={adminNavigation} pathname={pathname} />}
            </div>
          </details>
          <div className="topbar-context">
            <strong>Site Sangatta</strong>
            <span>WITA</span>
          </div>
          <div className="topbar-user">
            <span className="semantic-dot semantic-dot-online" aria-hidden="true" />
            {user.name}
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
