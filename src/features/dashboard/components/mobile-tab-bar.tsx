"use client";

import { BarChart3, Bot, LineChart, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type MobileTab,
  useDashboard,
} from "@/features/dashboard/dashboard-context";

const TABS: { id: MobileTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "chart", label: "Chart", icon: LineChart },
  { id: "trade", label: "Trade", icon: BarChart3 },
  { id: "positions", label: "Positions", icon: ScrollText },
  { id: "agent", label: "Agent", icon: Bot },
];

export function MobileTabBar() {
  const { activeTab, setActiveTab } = useDashboard();

  return (
    <nav className="mobile-tab-bar lg:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "mobile-tab-item",
              active && "mobile-tab-item--active",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon className="size-4" />
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
