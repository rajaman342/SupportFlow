import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { RoleBadge } from './Badge.jsx';
import SystemHealth from './SystemHealth.jsx';
import {
  Server,
  LogOut,
  Ticket,
  PlusCircle,
  Users,
  Shield,
  Menu,
  X,
  BookOpen,
  User as UserIcon
} from 'lucide-react';

export default function Layout() {
  const { user, logout, isCustomer, isStaff, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive
        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-850/95 backdrop-blur border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo */}
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2.5 group">
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white group-hover:bg-indigo-500 transition">
                  <Server className="w-5 h-5" />
                </div>
                <span className="text-lg font-bold tracking-tight text-white group-hover:text-indigo-200 transition">
                  SupportFlow
                </span>
              </Link>

              {/* Desktop Nav Links */}
              <nav className="hidden md:flex items-center gap-1">
                {isCustomer && (
                  <>
                    <NavLink to="/tickets" end className={navLinkClass}>
                      <Ticket className="w-4 h-4" />
                      <span>My Tickets</span>
                    </NavLink>
                    <NavLink to="/tickets/new" className={navLinkClass}>
                      <PlusCircle className="w-4 h-4" />
                      <span>New Ticket</span>
                    </NavLink>
                  </>
                )}

                {isStaff && (
                  <>
                    <NavLink to="/agent/tickets" className={navLinkClass}>
                      <Ticket className="w-4 h-4" />
                      <span>Ticket Queue</span>
                    </NavLink>
                    <NavLink to="/agent/documents" className={navLinkClass}>
                      <BookOpen className="w-4 h-4" />
                      <span>Knowledge Base</span>
                    </NavLink>
                  </>
                )}

                {isAdmin && (
                  <>
                    <NavLink to="/admin/users" className={navLinkClass}>
                      <Users className="w-4 h-4" />
                      <span>Users</span>
                    </NavLink>
                    <NavLink to="/admin/audit-logs" className={navLinkClass}>
                      <Shield className="w-4 h-4" />
                      <span>Audit Logs</span>
                    </NavLink>
                  </>
                )}
              </nav>
            </div>

            {/* Desktop User Menu & Actions */}
            <div className="hidden md:flex items-center gap-4">
              <div className="flex items-center gap-3 pr-4 border-r border-slate-800">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-white leading-tight">{user?.fullName || 'User'}</span>
                    <span className="text-xs text-slate-400">{user?.email}</span>
                  </div>
                </div>
                <RoleBadge role={user?.role} />
              </div>

              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition disabled:opacity-50"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-900 px-4 pt-2 pb-4 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex flex-col">
                <span className="font-semibold text-white">{user?.fullName}</span>
                <span className="text-xs text-slate-400">{user?.email}</span>
              </div>
              <RoleBadge role={user?.role} />
            </div>

            <nav className="flex flex-col gap-1">
              {isCustomer && (
                <>
                  <NavLink
                    to="/tickets"
                    end
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass}
                  >
                    <Ticket className="w-4 h-4" />
                    <span>My Tickets</span>
                  </NavLink>
                  <NavLink
                    to="/tickets/new"
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>New Ticket</span>
                  </NavLink>
                </>
              )}

              {isStaff && (
                <>
                  <NavLink
                    to="/agent/tickets"
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass}
                  >
                    <Ticket className="w-4 h-4" />
                    <span>Ticket Queue</span>
                  </NavLink>
                  <NavLink
                    to="/agent/documents"
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Knowledge Base</span>
                  </NavLink>
                </>
              )}

              {isAdmin && (
                <>
                  <NavLink
                    to="/admin/users"
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass}
                  >
                    <Users className="w-4 h-4" />
                    <span>Users</span>
                  </NavLink>
                  <NavLink
                    to="/admin/audit-logs"
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Audit Logs</span>
                  </NavLink>
                </>
              )}
            </nav>

            <div className="pt-2">
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-800 text-rose-300 hover:bg-slate-700 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer with Service Status */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>SupportFlow AI Platform</span>
            <span>•</span>
            <span>Tenant: {user?.organizationId ? user.organizationId.slice(0, 8) : 'demo'}</span>
          </div>
          <div className="w-full sm:w-auto max-w-xs">
            <SystemHealth />
          </div>
        </div>
      </footer>
    </div>
  );
}
