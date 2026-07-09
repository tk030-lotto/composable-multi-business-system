'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './sidebar';
import Header from './header';
import Footer from './footer';

interface DashboardLayoutProps {
  children: React.ReactNode;
  modules: {
    lineSlack: boolean;
    calendar: boolean;
    rbac: boolean;
  };
}

export default function DashboardLayout({ children, modules }: DashboardLayoutProps) {
  const pathname = usePathname();

  // ログイン画面（免責ゲート）ではダッシュボードレイアウトを適用しない
  if (pathname === '/login') {
    return (
      <div className="blank-layout">
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <Sidebar modules={modules} />
      <Header modules={modules} />
      <main className="dashboard-main">
        <div style={{ flex: 1, minHeight: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
