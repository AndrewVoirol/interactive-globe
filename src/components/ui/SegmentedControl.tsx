// ============================================================================
// File: src/components/ui/SegmentedControl.tsx
// Primitive: Machined Bevel Segmented Control & Mode Switcher
// Accessible radiogroup for mutually-exclusive mode and tier selections
// ============================================================================

import React from 'react';

export interface SegmentOption<T extends string | number> {
  id: T;
  label: string;
  sublabel?: string;
  title?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
  className = '',
  id,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + options.length) % options.length;
    }
    if (nextIndex !== index) {
      onChange(options[nextIndex].id);
    }
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      className={`inline-flex items-center p-0.5 rounded-[2px] border transition-colors bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] gap-0.5 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.id === value;
        return (
          <button
            key={String(opt.id)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            title={opt.title || opt.label}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`tactile-btn rounded-[2px] font-bold transition-all shrink-0 flex flex-col items-center justify-center outline-none whitespace-nowrap focus-visible:ring-1 focus-visible:ring-[var(--theme-text-accent)] ${
              size === 'sm' ? 'px-1.5 py-0.5 text-nano tracking-tight' : 'px-2 py-1 text-micro'
            } ${
              isSelected
                ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm font-semibold'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)] border border-transparent'
            }`}
          >
            <span className="truncate">{opt.label}</span>
            {opt.sublabel && (
              <span className="text-nano opacity-65 uppercase font-mono tracking-tighter">
                {opt.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
