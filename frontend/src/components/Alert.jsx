import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export default function Alert({ type = 'info', title, message, details, onDismiss }) {
  const configs = {
    error: {
      bg: 'bg-rose-950/40 border-rose-800 text-rose-200',
      icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
    },
    warning: {
      bg: 'bg-amber-950/40 border-amber-800 text-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
    },
    success: {
      bg: 'bg-emerald-950/40 border-emerald-800 text-emerald-200',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
    },
    info: {
      bg: 'bg-indigo-950/40 border-indigo-800 text-indigo-200',
      icon: <Info className="w-5 h-5 text-indigo-400 shrink-0" />
    }
  };

  const current = configs[type] || configs.info;

  return (
    <div
      className={`p-4 rounded-lg border flex gap-3 items-start relative ${current.bg}`}
      role="alert"
    >
      {current.icon}
      <div className="flex-1 text-sm space-y-1">
        {title && <p className="font-semibold text-white">{title}</p>}
        {message && <p>{message}</p>}
        {Array.isArray(details) && details.length > 0 && (
          <ul className="list-disc list-inside mt-2 space-y-0.5 text-xs opacity-90">
            {details.map((d, idx) => (
              <li key={idx}>
                {typeof d === 'string' ? d : `${d.field ? `${d.field}: ` : ''}${d.issue || d.message}`}
              </li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-white transition p-1"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
