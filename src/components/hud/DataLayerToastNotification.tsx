// ============================================================================
// File: src/components/hud/DataLayerToastNotification.tsx
// Modular Floating Widget: Bottom-Left Glassmorphic Toast Notification Stack
// ============================================================================

import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'loading' | 'warning' | 'error';
  title: string;
  message?: string;
  progress?: number; // 0 to 100
}

export interface DataLayerToastNotificationProps {
  toasts: ToastMessage[];
  theme: 0 | 1 | 2;
  onDismissToast?: (id: string) => void;
  showCartouche?: boolean;
}

const ToastItem: React.FC<{
  toast: ToastMessage;
  themeName: string;
  onDismissToast?: (id: string) => void;
}> = ({ toast, themeName, onDismissToast }) => {
  useEffect(() => {
    if (toast.type === 'loading') return;
    const duration = toast.type === 'error' ? 5000 : 3500;
    const timer = setTimeout(() => {
      onDismissToast?.(toast.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onDismissToast]);

  let icon = (
    <svg className="w-4 h-4 text-[var(--theme-status-slate)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  if (toast.type === 'success') {
    icon = (
      <svg className="w-4 h-4 text-[var(--theme-status-sage)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    );
  } else if (toast.type === 'loading') {
    icon = (
      <svg className="w-4 h-4 text-[var(--theme-status-slate)] animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    );
  } else if (toast.type === 'warning') {
    icon = (
      <svg className="w-4 h-4 text-[var(--theme-status-amber)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  } else if (toast.type === 'error') {
    icon = (
      <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  return (
    <div
      data-theme={themeName}
      className="p-3 rounded-[2px] border backdrop-blur-xl shadow-2xl transition-all duration-300 flex flex-col gap-1 pointer-events-auto bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-bold truncate">
          {/* Miniature cartographic color-ramp swatch */}
          <div className="w-1.5 h-5 rounded-full flex-shrink-0 overflow-hidden shadow-sm" title="Cartographic strata indicator">
            <div
              className="w-full h-full"
              style={{
                background: toast.type === 'success'
                  ? 'linear-gradient(to bottom, var(--theme-status-sage), var(--theme-text-accent))'
                  : toast.type === 'error'
                  ? 'linear-gradient(to bottom, #ef4444, #f43f5e)'
                  : toast.type === 'warning'
                  ? 'linear-gradient(to bottom, var(--theme-status-amber), var(--theme-text-accent))'
                  : 'linear-gradient(to bottom, var(--theme-status-slate), var(--theme-pulse-indicator))'
              }}
            />
          </div>
          {icon}
          <span className="truncate text-body tracking-tight">{toast.title}</span>
        </div>
        <button
          onClick={() => onDismissToast?.(toast.id)}
          className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-accent)] p-0.5 transition-colors cursor-pointer"
          title="Dismiss"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {toast.message && (
        <p className="text-micro pl-6 text-[var(--theme-text-secondary)]">
          {toast.message}
        </p>
      )}

      {toast.progress !== undefined && (
        <div className="mt-1 space-y-0.5">
          <div className="flex items-center justify-between text-nano font-bold text-[var(--theme-text-accent)] font-mono">
            <span>LOADING TILES</span>
            <span>{Math.round(toast.progress)}%</span>
          </div>
          <div className="h-1 w-full bg-[var(--theme-control-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--theme-text-accent)] transition-all duration-200"
              style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const DataLayerToastNotification: React.FC<DataLayerToastNotificationProps> = ({
  toasts,
  theme,
  onDismissToast,
  showCartouche: showCartoucheProp,
}) => {
  const themeName = theme === 2 ? 'cyanotype' : theme === 1 ? 'cream' : 'tharp';

  // Cap visible toasts to maximum 3 concurrent items to prevent overflowing viewport
  const visibleToasts = toasts.slice(-3);

  if (visibleToasts.length === 0) return null;

  return (
    <div className="fixed bottom-[78px] left-5 z-[35] pointer-events-none max-w-xs w-80 font-mono select-none space-y-2 transition-all duration-300">
      {visibleToasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          themeName={themeName}
          onDismissToast={onDismissToast}
        />
      ))}
    </div>
  );
};
