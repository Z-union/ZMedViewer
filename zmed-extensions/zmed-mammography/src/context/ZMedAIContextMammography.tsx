import React, { useEffect, useState, useCallback, useContext } from 'react';

export const ZMedAIContextMammography = React.createContext();
ZMedAIContextMammography.displayName = 'ZMedAIContextMammography';
export const useZMedAIMammography = () => useContext(ZMedAIContextMammography);

export function ZMedAIContextProviderMammography({ children }) {
  return (
    <ZMedAIContextMammography.Provider value={{ example: 'value' }}>
      {children}
    </ZMedAIContextMammography.Provider>
  );
}
