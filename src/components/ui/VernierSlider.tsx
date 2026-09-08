// ============================================================================
// File: src/components/ui/VernierSlider.tsx
// Primitive: Calibrated Vernier Millimeter Range Slider with Steppers
// Theme-adaptive, accessible slider with fine-increment buttons & tabular readout
// ============================================================================

import React from 'react';

export interface VernierSliderProps {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  readout?: string;
  onChange?: (val: number) => void;
  disabled?: boolean;
  showSteppers?: boolean;
  showTicks?: boolean;
  className?: string;
}

export const VernierSlider: React.FC<VernierSliderProps> = ({
  id,
  label,
  sublabel,
  value,
  min,
  max,
  step,
  unit = '',
  readout,
  onChange,
  disabled = false,
  showSteppers = true,
  showTicks = true,
  className = '',
}) => {
  const handleStep = (dir: -1 | 1) => {
    if (disabled || !onChange) return;
    const next = Math.max(min, Math.min(max, parseFloat((value + dir * step).toFixed(3))));
    onChange(next);
  };

  const formattedReadout = readout !== undefined ? readout : `${value}${unit}`;

  return (
    <div
      className={`p-2 rounded-[2px] border space-y-1.5 transition-colors bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {/* Header: Label, Sublabel & Readout/Steppers */}
      <div className="flex items-center justify-between text-micro">
        <div className="flex flex-col min-w-0 pr-1">
          <label
            htmlFor={id}
            className="font-bold uppercase tracking-wider text-[var(--theme-text-primary)] cursor-pointer truncate text-body"
          >
            {label}
          </label>
          {sublabel && (
            <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)] truncate">
              {sublabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {showSteppers && (
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={disabled || value <= min}
              title={`Decrease ${label}`}
              className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors"
            >
              -
            </button>
          )}

          <span className="font-mono font-bold tabular-nums text-body min-w-[36px] text-right text-[var(--theme-text-primary)]">
            {formattedReadout}
          </span>

          {showSteppers && (
            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={disabled || value >= max}
              title={`Increase ${label}`}
              className="tactile-press w-5 h-5 rounded-[1px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] hover:bg-[var(--theme-control-hover-bg)] text-[var(--theme-text-accent)] disabled:opacity-35 flex items-center justify-center font-bold text-body leading-none select-none transition-colors"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Slider Track & Millimeter Vernier Calibration */}
      <div className="relative pt-0.5">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(parseFloat(e.target.value))}
          className="w-full slider-archival h-1 cursor-pointer block transition-opacity"
        />

        {showTicks && (
          <div className="vernier-ticks pt-0.5" aria-hidden="true">
            <span>|</span><span>·</span><span>·</span><span>·</span><span>|</span>
            <span>·</span><span>·</span><span>·</span><span>|</span><span>·</span>
            <span>·</span><span>·</span><span>|</span>
          </div>
        )}
      </div>
    </div>
  );
};
