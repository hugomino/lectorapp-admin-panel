'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Verificación' },
  { href: '/amazon', label: 'Amazon' },
  { href: '/reportes', label: 'Reportes' },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`border-b-2 px-3 py-3 text-sm font-medium ${
                  isActive
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-sm text-slate-500 hover:text-slate-800">
            Salir
          </button>
        </form>
      </div>
    </nav>
  );
}
