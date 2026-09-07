// ============================================================================
// File: src/components/ui/TactileSwitch.tsx
// Primitive: Machined Knurled Tactile Slide Switch
// Accessible, theme-adaptive switch with physical 3-ridge thumb feedback
// ============================================================================

import React from 'react';

export interface TactileSwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  sublabel?: string;
  title?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const TactileSwitch: React.FC<TactileSwitchProps> = ({
  checked,
  onChange,
  label,
  sublabel,
  title,
  disabled = false,
  id,
  className = '',
}) => {
  const handleToggle = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  return (
    <div
      id={id}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      title={title || label}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={`tactile-btn group flex items-center justify-between py-1.5 px-2 rounded-[2px] border cursor-pointer select-none transition-all outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-text-accent)] ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${
        checked
          ? 'bg-[var(--theme-control-active-bg)] border-[var(--theme-control-active-border)] text-[var(--theme-control-active-text)] shadow-sm'
          : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-text-primary)]'
      } ${className}`}
    >
      <div className="flex flex-col min-w-0 pr-2">
        <span className="font-bold text-body tracking-wide truncate transition-colors">
          {label}
        </span>
        {sublabel && (
          <span className="text-nano opacity-65 font-mono truncate">
            {sublabel}
          </span>
        )}
      </div>

      {/* 3-Ridge Machined Knurled Slide Track & Thumb */}
      <div
        className={`knurl-switch w-8 h-4 rounded-[2px] border relative shrink-0 shadow-inner flex items-center px-0.5 transition-colors ${
          checked
            ? 'bg-[var(--theme-switch-track-active-bg)] border-[var(--theme-switch-track-active-border)]'
            : 'bg-[var(--theme-switch-track-bg)] border-[var(--theme-switch-track-border)]'
        }`}
      >
        <div
          className={`knurl-thumb w-3 h-3 rounded-[1px] border shadow-sm flex items-center justify-center transition-transform ${
            checked
              ? 'translate-x-3.5 bg-[var(--theme-switch-thumb-active-bg)] border-[var(--theme-switch-thumb-active-border)] text-[var(--theme-switch-thumb-active-text)]'
              : 'translate-x-0 bg-[var(--theme-switch-thumb-bg)] border-[var(--theme-switch-thumb-border)] text-[var(--theme-switch-thumb-text)]'
          }`}
        >
          <div className="w-1.5 h-1.5 flex flex-col justify-between opacity-75">
            <span className="knurl-ridge" />
            <span className="knurl-ridge" />
            <span className="knurl-ridge" />
          </div>
        </div>
      </div>
    </div>
  );
};
