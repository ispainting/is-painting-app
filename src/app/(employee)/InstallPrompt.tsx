"use client";

import { useEffect, useState } from "react";
import { X, Share, Smartphone } from "lucide-react";

type Platform = "ios" | "android" | null;

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) return;

    if (localStorage.getItem("install-prompt-dismissed")) return;

    const snoozeUntil = localStorage.getItem("install-prompt-snooze");
    if (snoozeUntil && Date.now() < parseInt(snoozeUntil, 10)) return;

    const ua = navigator.userAgent.toLowerCase();

    let detected: Platform = null;

    if (/iphone|ipad|ipod/.test(ua)) {
      detected = "ios";
    } else if (/android/.test(ua)) {
      detected = "android";
    }

    if (!detected) return;

    setPlatform(detected);

    const timer = setTimeout(() => {
      setShow(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    localStorage.setItem("install-prompt-dismissed", "1");
    setShow(false);
  };

  const remindLater = () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "install-prompt-snooze",
      tomorrow.toString()
    );
    setShow(false);
  };

  if (!show || !platform) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="rounded-lg shadow-lg bg-blue-600 text-white p-4">
        <div className="flex items-start gap-3">
          <div className="bg-white/10 rounded-md p-2 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>

          <div className="flex-1">
            <div className="font-semibold mb-1">
              Install I.S Painting App
            </div>

            {platform === "ios" ? (
              <div className="text-sm">
                Tap <Share className="inline w-3 h-3" /> then
                "Add to Home Screen"
              </div>
            ) : (
              <div className="text-sm">
                Tap menu (⋮) then "Install App"
              </div>
            )}
          </div>

          <button onClick={dismiss}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={remindLater}
          className="text-xs mt-3"
        >
          Remind me later
        </button>
      </div>
    </div>
  );
}
