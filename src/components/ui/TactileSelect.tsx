// ============================================================================
// File: src/components/ui/TactileSelect.tsx
// Primitive: Archival Vellum TactileSelect Popover Menu
// Styled in ivory vellum with coordinates metadata and accessible keyboard navigation
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface TactileSelectOption {
  id: string;
  label: string;
  coordinates?: string;
  description?: string;
}

export interface TactileSelectProps {
  id?: string;
  value: string;
  options: readonly TactileSelectOption[] | TactileSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export const TactileSelect: React.FC<TactileSelectProps> = ({
  id,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel = 'Select option',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find((opt) => opt.id === value) || options[0];
  const listboxId = id ? `${id}-listbox` : 'tactile-select-listbox';

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const handleSelect = useCallback(
    (optionId: string) => {
      onChange(optionId);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (options.length > 0) {
        const currentIndex = options.findIndex((opt) => opt.id === value);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % options.length;
        onChange(options[nextIndex].id);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (options.length > 0) {
        const currentIndex = options.findIndex((opt) => opt.id === value);
        const prevIndex = currentIndex === -1 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length;
        onChange(options[prevIndex].id);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (options.length > 0) {
        onChange(options[0].id);
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      if (options.length > 0) {
        onChange(options[options.length - 1].id);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full font-mono text-micro select-none ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        data-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full py-1.5 px-2.5 rounded-[2px] border text-left flex items-center justify-between transition-all cursor-pointer border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)] hover:bg-[var(--theme-control-hover-bg)] ${
          isOpen ? 'ring-1 ring-[var(--theme-control-active-ring)] border-[var(--theme-control-active-border)] shadow-sm' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-1">
          <span className="font-bold tracking-wide truncate">{selectedOption?.label}</span>
          {selectedOption?.coordinates && (
            <span className="text-nano opacity-65 font-mono text-[var(--theme-text-accent)] truncate">
              ⌞ {selectedOption.coordinates}
            </span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover Dropdown styled in Archival Vellum */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 left-0 right-0 mt-1 py-1 rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] shadow-xl backdrop-blur-md space-y-0.5 max-h-60 overflow-y-auto scrollbar-none animate-in fade-in zoom-in-95 duration-100"
        >
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] font-semibold'
                    : 'text-[var(--theme-text-primary)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-text-accent)]'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-micro truncate">{opt.label}</span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-text-accent)] shrink-0" />
                    )}
                  </div>
                  {opt.description && (
                    <span className="text-nano opacity-65 font-mono truncate">{opt.description}</span>
                  )}
                </div>
                {opt.coordinates && (
                  <span className="text-nano font-mono tabular-nums opacity-80 shrink-0 text-[var(--theme-text-accent)]">
                    {opt.coordinates}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
