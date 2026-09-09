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
  theme: 0 | 1 | 2;
  onDismissToast?: (id: string) => void;
  showCartouche?: boolean;
}

export const DataLayerToastNotification: React.FC<DataLayerToastNotificationProps> = ({
  toasts,
  theme,
  onDismissToast,
  showCartouche: showCartoucheProp,
}) => {
  const themeName = theme === 2 ? 'cyanotype' : theme === 1 ? 'cream' : 'tharp';

  const [cartoucheVisible, setCartoucheVisible] = React.useState<boolean>(
    showCartoucheProp !== undefined ? showCartoucheProp : true
  );

  useEffect(() => {
    if (showCartoucheProp !== undefined) {
      setCartoucheVisible(showCartoucheProp);
      return;
    }

    const checkCartouche = () => {
      const el = document.querySelector('[data-cartouche]');
      if (el) {
        setCartoucheVisible(el.getAttribute('data-cartouche') !== 'false');
      }
    };

    checkCartouche();
    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ showCartouche: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.showCartouche === 'boolean') {
        setCartoucheVisible(customEvent.detail.showCartouche);
      } else {
        checkCartouche();
      }
    };

    window.addEventListener('cartouche-visibility-change', handleEvent);
    const observer = new MutationObserver(checkCartouche);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-cartouche'] });

    return () => {
      window.removeEventListener('cartouche-visibility-change', handleEvent);
      observer.disconnect();
    };
  }, [showCartoucheProp]);

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
    <div className={`fixed ${cartoucheVisible ? 'bottom-[170px]' : 'bottom-[78px]'} left-5 z-[35] pointer-events-none max-w-xs w-80 font-mono select-none space-y-2 transition-all duration-300`}>
      {toasts.map((toast) => {
        let badgeBg = 'bg-[var(--theme-status-slate)]/20 text-[var(--theme-status-slate)] border-[var(--theme-status-slate)]/40';
        let icon = (
          <svg className="w-4 h-4 text-[var(--theme-status-slate)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );

        if (toast.type === 'success') {
          badgeBg = 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40';
          icon = (
            <svg className="w-4 h-4 text-[var(--theme-status-sage)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          );
        } else if (toast.type === 'loading') {
          badgeBg = 'bg-[var(--theme-status-slate)]/20 text-[var(--theme-status-slate)] border-[var(--theme-status-slate)]/40';
          icon = (
            <svg className="w-4 h-4 text-[var(--theme-status-slate)] animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          );
        } else if (toast.type === 'warning') {
          badgeBg = 'bg-[var(--theme-status-amber)]/20 text-[var(--theme-status-amber)] border-[var(--theme-status-amber)]/40';
          icon = (
            <svg className="w-4 h-4 text-[var(--theme-status-amber)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          );
        }

        return (
          <div
            key={toast.id}
            data-theme={themeName}
            className="p-3 rounded-[2px] border backdrop-blur-xl shadow-2xl transition-all duration-300 flex flex-col gap-1 pointer-events-auto bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)]"
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
                        : toast.type === 'warning'
                        ? 'linear-gradient(to bottom, var(--theme-status-amber), #c86d51)'
                        : 'linear-gradient(to bottom, var(--theme-status-slate), var(--theme-pulse-indicator))'
                    }}
                  />
                </div>
                {icon}
                <span className="truncate text-body tracking-tight">{toast.title}</span>
              </div>
              <button
                onClick={() => onDismissToast?.(toast.id)}
                className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-accent)] p-0.5 transition-colors"
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
      })}
    </div>
  );
};
