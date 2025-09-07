import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { Logo } from "~/components/ui/logo";
import { useWindowStore } from "~/stores/window";

interface RestOverlayProps {
  timeRemaining: number;
  onSkip?: () => void;
}

export function RestOverlay({ timeRemaining, onSkip }: RestOverlayProps) {
  const { setAlwaysOnTop, setSize, setPosition } = useWindowStore();

  useEffect(() => {
    // For invasive overlay: temporarily expand window to cover screen and make it always on top
    setAlwaysOnTop(true);
    
    // Position the window at the top-left corner and expand to cover the entire screen
    setPosition({ x: 0, y: 0 });
    
    // Get screen dimensions and expand the window to cover the entire screen
    if (typeof window !== 'undefined' && window.screen) {
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;
      setSize({ width: screenWidth, height: screenHeight });
    }

    // Handle escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onSkip) {
        onSkip();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Cleanup when component unmounts - restore normal window size and position
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      setAlwaysOnTop(false);
      // Restore normal app window size and center it
      setSize({ width: 400, height: 600 });
      // Center the window on screen
      if (typeof window !== 'undefined' && window.screen) {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        setPosition({ 
          x: Math.floor((screenWidth - 400) / 2), 
          y: Math.floor((screenHeight - 600) / 2) 
        });
      }
    };
  }, [setAlwaysOnTop, setSize, setPosition, onSkip]);

  // Extract minutes from time remaining (assuming timeRemaining is in seconds)
  const minutes = Math.ceil(timeRemaining / 60);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-orange-700 via-orange-800 to-orange-900">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_75%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.02)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,0.02)_25%,transparent_25%)] bg-[20px_20px]" />
      </div>

      <div className="relative text-center text-white px-8">
        {/* Main message */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-6xl font-light tracking-wide leading-tight">
            YOU DESERVE A
          </h1>
          <h1 className="text-4xl md:text-6xl font-light tracking-wide leading-tight">
            WELL DEFINED REST
          </h1>
        </div>

        {/* Timer section */}
        <div className="flex items-center justify-center space-x-6 mb-12">
          <div className="flex items-center space-x-3">
            {/* Pomodoro logo/icon */}
            <div className="flex items-center space-x-2 text-2xl font-bold">
              <Logo showText className="h-8 w-8" textClassName="text-2xl font-bold" />
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className="mb-8">
          <div className="text-8xl md:text-[10rem] font-light mb-4 tabular-nums">
            {minutes}
          </div>
          <div className="text-lg tracking-[0.3em] text-orange-200 uppercase">
            MINUTES REMAINING
          </div>
          <div className="text-sm text-orange-300 mt-4 tracking-wider">
            THIS OVERLAY WILL DISAPPEAR AFTER THE TIMER
          </div>
        </div>

        {/* Optional skip button */}
        {onSkip && (
          <div className="space-y-4">
            <button
              onClick={onSkip}
              className="px-8 py-3 text-sm text-orange-200 border border-orange-400 rounded-lg hover:bg-orange-800 transition-colors"
            >
              Skip Rest
            </button>
            <p className="text-xs text-orange-400">
              Press ESC to skip this rest period
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
