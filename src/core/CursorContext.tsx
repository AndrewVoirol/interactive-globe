import React, { createContext, useContext, useEffect, useRef } from 'react';
import { CursorTracker } from '../utils/raycast';

const CursorContext = createContext<CursorTracker | null>(null);

export const CursorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const trackerRef = useRef<CursorTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new CursorTracker();
  }

  useEffect(() => {
    const tracker = trackerRef.current;
    if (typeof window !== 'undefined' && tracker) {
      tracker.attach(window);
    }
    return () => {
      tracker?.detach();
    };
  }, []);

  return (
    <CursorContext.Provider value={trackerRef.current}>
      {children}
    </CursorContext.Provider>
  );
};

export function useCursorTracker(): CursorTracker {
  const context = useContext(CursorContext);
  if (!context) {
    // Fallback if rendered outside CursorProvider context
    const fallbackRef = useRef<CursorTracker | null>(null);
    if (!fallbackRef.current) {
      fallbackRef.current = new CursorTracker();
      if (typeof window !== 'undefined') {
        fallbackRef.current.attach(window);
      }
    }
    return fallbackRef.current;
  }
  return context;
}
