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

let fallbackTrackerInstance: CursorTracker | null = null;

export function useCursorTracker(): CursorTracker {
  const context = useContext(CursorContext);
  if (!context) {
    if (typeof window !== 'undefined' && !fallbackTrackerInstance) {
      fallbackTrackerInstance = new CursorTracker();
      fallbackTrackerInstance.attach(window);
    }
    return fallbackTrackerInstance!;
  }
  return context;
}

