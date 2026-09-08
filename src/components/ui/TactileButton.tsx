// ============================================================================
// File: src/components/ui/TactileButton.tsx
// Primitive: Tactile Action Button
// Hierarchical push button with physical press feedback and theme-token styling
// ============================================================================

import React from 'react';

export interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const TactileButton: React.FC<TactileButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  active = false,
  children,
  className = '',
  disabled = false,
  type = 'button',
  ...rest
}) => {
  let variantStyles = '';

  if (variant === 'primary') {
    variantStyles = active
      ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)] ring-1 ring-[var(--theme-control-active-ring)] shadow-sm font-semibold'
      : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)] hover:border-[var(--theme-control-hover-border)]';
  } else if (variant === 'ghost') {
    variantStyles = active
      ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)]'
      : 'bg-transparent border-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)]';
  } else if (variant === 'icon') {
    variantStyles = active
      ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)] shadow-sm'
      : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-text-primary)]';
  } else {
    // Secondary default
    variantStyles = active
      ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)] font-semibold'
      : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-control-hover-border)]';
  }

  const sizeStyles =
    variant === 'icon'
      ? size === 'sm'
        ? 'w-5 h-5 p-0.5'
        : size === 'lg'
        ? 'w-8 h-8 p-1.5'
        : 'w-7 h-7 p-1'
      : size === 'sm'
      ? 'px-1.5 py-0.5 text-micro'
      : size === 'lg'
      ? 'px-2.5 py-1.5 text-title'
      : 'px-2 py-1 text-body';

  return (
    <button
      type={type}
      disabled={disabled}
      className={`tactile-btn font-bold rounded-[2px] border transition-all inline-flex items-center justify-center gap-1.5 shrink-0 select-none outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-text-accent)] disabled:opacity-40 disabled:pointer-events-none ${sizeStyles} ${variantStyles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};
