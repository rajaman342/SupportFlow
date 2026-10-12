import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ size = 'md', text = 'Loading...', fullScreen = false }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10'
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3 p-4" role="status" aria-live="polite">
      <Loader2 className={`${sizeClasses[size] || sizeClasses.md} animate-spin text-indigo-500`} />
      {text ? (
        <p className="text-sm text-slate-400 font-medium">{text}</p>
      ) : (
        <span className="sr-only">Loading...</span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
}
