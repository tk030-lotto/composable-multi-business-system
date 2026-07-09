/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCurrentRole } from '@/modules/advanced-rbac';

interface SidebarProps {
  modules: {
    lineSlack: boolean;
    calendar: boolean;
    rbac: boolean;
  };
}

export default function Sidebar({ modules }: SidebarProps) {
  const pathname = usePathname();
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    setIsStaff(getCurrentRole() === 'staff');
  }, []);

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-logo">
        <span>⚙️</span>
        <span>CRM Basekit</span>
      </div>

      <nav className="sidebar-nav">
        <Link 
          href="/" 
          className={`nav-item ${pathname === '/' ? 'active' : ''}`}
        >
          <span>📊</span>
          <span>ダッシュボード</span>
        </Link>
        {(!modules.rbac || !isStaff) && (
          <Link 
            href="/audit-logs" 
            className={`nav-item ${pathname === '/audit-logs' ? 'active' : ''}`}
          >
            <span>🕒</span>
            <span>操作履歴</span>
          </Link>
        )}
        {modules.calendar && (
          <Link 
            href="/calendar" 
            className={`nav-item ${pathname === '/calendar' ? 'active' : ''}`}
          >
            <span>📅</span>
            <span>カレンダー</span>
          </Link>
        )}
      </nav>

      <div className="sidebar-modules">
        <h3 className="modules-title">拡張モジュール</h3>
        <div className="module-status-list">
          <div className="module-status-item">
            <span>通知連携 (A)</span>
            <span className={`module-badge ${modules.lineSlack ? 'active' : 'inactive'}`}>
              {modules.lineSlack ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="module-status-item">
            <span>カレンダー (B)</span>
            <span className={`module-badge ${modules.calendar ? 'active' : 'inactive'}`}>
              {modules.calendar ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="module-status-item">
            <span>詳細権限 (C)</span>
            <span className={`module-badge ${modules.rbac ? 'active' : 'inactive'}`}>
              {modules.rbac ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
