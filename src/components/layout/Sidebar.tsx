"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Users, Workflow, Clock, Package,
  Receipt, FileText, Bot, UserCog, BarChart3, Settings, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/opportunities", label: "Opportunities", icon: Workflow },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/automations", label: "Automations", icon: Bot },
  { href: "/employees", label: "Employees", icon: UserCog },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = api.auth.logout.useMutation({
    onSuccess: () => router.push("/login"),
  });

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="text-sm font-bold text-brand-700">I.S PAINTING</div>
        <div className="text-xs text-slate-500">Business Manager</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                active
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-slate-700 hover:bg-slate-100"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => logout.mutate()}
        className="m-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </aside>
  );
}
