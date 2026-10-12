import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There are no records to display at this time.',
  action
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-800/40 border border-slate-700/60 rounded-xl">
      <div className="p-3 bg-slate-800 rounded-full border border-slate-700 mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
