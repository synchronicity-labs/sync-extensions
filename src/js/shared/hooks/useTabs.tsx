import React, { useState, useEffect, useCallback, createContext, useContext } from "react";

export type Tab = "sources" | "history" | "settings";

interface TabsContextType {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) {
    // Fallback if context not provided (shouldn't happen in normal usage)
    const [activeTab, setActiveTabState] = useState<Tab>("sources");
    const setActiveTab = useCallback((tab: Tab) => {
      setActiveTabState(tab);
      localStorage.setItem("sync_activeTab", tab);
    }, []);
    return { activeTab, setActiveTab };
  }
  return context;
};

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTabState] = useState<Tab>("sources");

  useEffect(() => {
    // Always start with "sources" - don't restore from localStorage on mount
    // This ensures the extension always starts on sources tab
    setActiveTabState("sources");
    localStorage.setItem("sync_activeTab", "sources");
  }, []);

  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    localStorage.setItem("sync_activeTab", tab);
  }, []);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
};

