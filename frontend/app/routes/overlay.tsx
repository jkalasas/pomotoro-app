import { useEffect, useState } from "react";
import { useWindowStore } from "~/stores/window";
import { usePomodoroStore } from "~/stores/pomodoro";

export default function Overlay() {
  const { closeOverlayWindow } = useWindowStore();
  const { skipRest, time } = usePomodoroStore();
  
  // Use the time from the pomodoro store instead of URL params
  const [timeRemaining, setTimeRemaining] = useState(time || 300);

  // Extract minutes from time remaining (assuming timeRemaining is in seconds)
  const minutes = Math.ceil(timeRemaining / 60);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleSkip();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) {
      handleSkip();
      return;
    }

    const timer = setTimeout(() => {
      setTimeRemaining(timeRemaining - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeRemaining]);

  const handleSkip = async () => {
    try {
      // Close the overlay window
      await closeOverlayWindow();
      // Skip the rest in the main app
      await skipRest();
    } catch (error) {
      console.error("Failed to skip rest:", error);
    }
  };

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
              <span className="text-white">🍅</span>
              <span>POMOTORO</span>
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

        {/* Skip button */}
        <div className="space-y-4">
          <button
            onClick={handleSkip}
            className="px-8 py-3 text-sm text-orange-200 border border-orange-400 rounded-lg hover:bg-orange-800 transition-colors"
          >
            Skip Rest
          </button>
          <p className="text-xs text-orange-400">
            Press ESC to skip this rest period
          </p>
        </div>
      </div>
    </div>
  );
}
