import React, { useEffect, useState, useCallback, useContext } from 'react';

export const ZMedAIContext = React.createContext();
ZMedAIContext.displayName = 'ZMedAIContext';
export const useZMedAI = () => useContext(ZMedAIContext);

export function ZMedAIContextProvider({ children }) {
  return (
    <ZMedAIContext.Provider value={{ example: 'value' }}>
      {children}
    </ZMedAIContext.Provider>
  );
}
