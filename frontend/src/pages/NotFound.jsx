import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const { isAuthenticated, isCustomer } = useAuth();

  const destination = !isAuthenticated ? '/login' : isCustomer ? '/tickets' : '/agent/tickets';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-8 text-center shadow-xl space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center">
          <FileQuestion className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white">404 — Page Not Found</h2>
        <p className="text-sm text-slate-400">
          The requested page could not be found or may have been moved.
        </p>
        <div className="pt-2">
          <Link
            to={destination}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Safety
          </Link>
        </div>
      </div>
    </div>
  );
}
