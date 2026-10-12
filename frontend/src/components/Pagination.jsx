import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page = 1, totalPages = 1, total = 0, limit = 20, onPageChange }) {
  if (totalPages <= 1 && total <= limit) {
    return null;
  }

  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 border-t border-slate-700/60 text-sm text-slate-400">
      <div>
        Showing <span className="font-semibold text-slate-200">{startRecord}</span> to{' '}
        <span className="font-semibold text-slate-200">{endRecord}</span> of{' '}
        <span className="font-semibold text-slate-200">{total}</span> results
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>
        <span className="px-2 font-medium text-slate-300">
          Page {page} of {totalPages || 1}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
