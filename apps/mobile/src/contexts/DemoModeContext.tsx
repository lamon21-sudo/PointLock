// =====================================================
// Demo Mode Context
// =====================================================
// Provides a boolean flag to any descendant that needs
// to know whether it is rendering inside the demo slip
// flow (e.g. to hide real-money UI, disable navigation
// to the live slip builder, etc.).
//
// Usage:
//   // Provider — wrap the demo screen tree
//   <DemoModeProvider>...</DemoModeProvider>
//
//   // Consumer — anywhere in the tree
//   const isDemo = useIsDemo();

import React, { createContext, useContext } from 'react';

// =====================================================
// Context Definition
// =====================================================

interface DemoModeContextValue {
  isDemo: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ isDemo: false });

// =====================================================
// Provider
// =====================================================

interface DemoModeProviderProps {
  children: React.ReactNode;
}

export function DemoModeProvider({ children }: DemoModeProviderProps) {
  return (
    <DemoModeContext.Provider value={{ isDemo: true }}>
      {children}
    </DemoModeContext.Provider>
  );
}

// =====================================================
// Hook
// =====================================================

/**
 * Returns true when rendered inside a DemoModeProvider.
 * Returns false in all real-app screens.
 */
export function useIsDemo(): boolean {
  return useContext(DemoModeContext).isDemo;
}

export default DemoModeContext;
