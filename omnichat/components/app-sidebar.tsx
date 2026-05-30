"use client";

import {
  Inbox,
  Users,
  BarChart3,
  Bot,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";
import type { Agent } from "@/lib/types";

const NAV = [
  { id: "inbox", label: "Hộp thư hợp nhất", icon: Inbox },
  { id: "contacts", label: "Khách hàng", icon: Users },
  { id: "agents", label: "AI Agents", icon: Bot },
  { id: "analytics", label: "Phân tích", icon: BarChart3 },
  { id: "settings", label: "Cài đặt", icon: Settings },
];

export function AppSidebar({ currentAgent }: { currentAgent?: Agent }) {
  return (
    <TooltipProvider delayDuration={120}>
      <aside className="flex h-full w-[76px] flex-col items-center gap-1 border-r bg-card/60 py-4">
        <div className="brand-gradient mb-3 flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {NAV.map((item, i) => {
            const active = i === 0;
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-secondary hover:text-foreground",
                      active &&
                        "bg-brand-50 text-brand-700 hover:bg-brand-50 hover:text-brand-700"
                    )}
                  >
                    {active && (
                      <span className="absolute -left-[14px] h-6 w-1 rounded-full bg-brand" />
                    )}
                    <Icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {currentAgent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative cursor-pointer">
                <Avatar className="h-10 w-10 ring-2 ring-card">
                  <AvatarFallback>{initials(currentAgent.name)}</AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {currentAgent.name} · {currentAgent.role}
            </TooltipContent>
          </Tooltip>
        )}
      </aside>
    </TooltipProvider>
  );
}
