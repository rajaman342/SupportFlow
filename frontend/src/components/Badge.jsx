import React from 'react';

export function StatusBadge({ status }) {
  const styles = {
    open: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  };

  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved'
  };

  const currentStyle = styles[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  const label = labels[status] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${currentStyle}`}>
      {label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const styles = {
    low: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    medium: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    urgent: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  };

  const labels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent'
  };

  const currentStyle = styles[priority] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  const label = labels[priority] || priority;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide uppercase border ${currentStyle}`}>
      {label}
    </span>
  );
}

export function RoleBadge({ role }) {
  const styles = {
    admin: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    agent: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    customer: 'bg-teal-500/10 text-teal-400 border-teal-500/20'
  };

  const labels = {
    admin: 'Admin',
    agent: 'Support Agent',
    customer: 'Customer'
  };

  const currentStyle = styles[role] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  const label = labels[role] || role;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${currentStyle}`}>
      {label}
    </span>
  );
}

export function ActiveBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
      Inactive
    </span>
  );
}
