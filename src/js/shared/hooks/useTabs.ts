import { useState, useEffect } from "react";

export type Tab = "sources" | "history" | "settings";

export const useTabs = () => {
  const [activeTab, setActiveTab] = useState<Tab>("sources");

  useEffect(() => {
    // Initialize from localStorage if available
    const savedTab = localStorage.getItem("sync_activeTab");
    if (savedTab && ["sources", "history", "settings"].includes(savedTab)) {
      setActiveTab(savedTab as Tab);
    }
  }, []);

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem("sync_activeTab", tab);
  };

  return { activeTab, setActiveTab: changeTab };
};

