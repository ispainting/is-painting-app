"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarDrawer } from "./Sidebar";

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex md:hidden h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="text-sm font-bold text-brand-700">I.S PAINTING</div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-slate-100 rounded-md"
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? (
            <X className="w-5 h-5 text-slate-600" />
          ) : (
            <Menu className="w-5 h-5 text-slate-600" />
          )}
        </button>
      </header>

      {isOpen && (
        <div className="fixed inset-0 z-30 top-14 bg-black/20 md:hidden" onClick={() => setIsOpen(false)}>
          <div
            className="bg-white border-b border-slate-200 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200">
              <div className="text-xs text-slate-500">Business Manager</div>
            </div>
            <SidebarDrawer onNavigate={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
