// ============================================================================
// File: src/components/hud/DataLayerToastNotification.tsx
// Modular Floating Widget: Bottom-Left Glassmorphic Toast Notification Stack
// ============================================================================

import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'loading' | 'warning';
  title: string;
  message?: string;
  progress?: number; // 0 to 100
}

export interface DataLayerToastNotificationProps {
  toasts: ToastMessage[];
  theme: 0 | 1;
  onDismissToast?: (id: string) => void;
}

export const DataLayerToastNotification: React.FC<DataLayerToastNotificationProps> = ({
  toasts,
  theme,
  onDismissToast,
}) => {
  const isLight = theme === 1;

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => {
      if (t.type === 'loading') return null; // Don't auto-dismiss active loading toasts
      return setTimeout(() => {
        onDismissToast?.(t.id);
      }, 3500);
    });

    return () => {
      timers.forEach((timer) => timer && clearTimeout(timer));
    };
  }, [toasts, onDismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-30 pointer-events-none max-w-xs w-80 font-mono select-none space-y-2">
      {toasts.map((toast) => {
        let badgeBg = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
        let icon = (
          <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );

        if (toast.type === 'success') {
          badgeBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
          icon = (
            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          );
        } else if (toast.type === 'loading') {
          badgeBg = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
          icon = (
            <svg className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          );
        } else if (toast.type === 'warning') {
          badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
          icon = (
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          );
        }

        return (
          <div
            key={toast.id}
            className={`p-3 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 flex flex-col gap-1 text-xs pointer-events-auto ${
              isLight
                ? 'bg-white/95 border-zinc-200 text-zinc-800 shadow-zinc-300/50'
                : 'bg-[#0F121A]/95 border-white/15 text-zinc-200 shadow-black/70'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-bold truncate">
                {icon}
                <span className="truncate text-[11px]">{toast.title}</span>
              </div>
              <button
                onClick={() => onDismissToast?.(toast.id)}
                className="text-zinc-500 hover:text-white p-0.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {toast.message && (
              <p className={`text-[10px] pl-6 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {toast.message}
              </p>
            )}

            {toast.progress !== undefined && (
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center justify-between text-[8px] font-bold text-sky-400">
                  <span>LOADING TILES</span>
                  <span>{Math.round(toast.progress)}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-700/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 transition-all duration-200"
                    style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
