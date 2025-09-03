import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { useWindowStore } from "~/stores/window";
import { usePomodoroStore } from "~/stores/pomodoro";

export default function Overlay() {
  const { closeOverlayWindow } = useWindowStore();
  const { skipRest, time } = usePomodoroStore();
  
  // Use the time from the pomodoro store instead of URL params
  const [timeRemaining, setTimeRemaining] = useState(time || 300);

  // Extract minutes from time remaining (assuming timeRemaining is in seconds)
  const minutes = Math.ceil(timeRemaining / 60);

  // Disable scrolling for this overlay page only
  useEffect(() => {
    // Disable scrolling and set overlay mode
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.setAttribute('data-overlay', 'true');
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.removeAttribute('data-overlay');
    };
  }, []);

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
      // Get the current window instance (this overlay window)
      const currentWindow = getCurrentWindow();
      
      // Emit event to main window to skip rest
      await emit('skip-rest');
      
      // Close this overlay window
      await currentWindow.close();
    } catch (error) {
      console.error("Failed to skip rest:", error);
      // Fallback: try to close the window anyway
      try {
        const currentWindow = getCurrentWindow();
        await currentWindow.close();
      } catch (closeError) {
        console.error("Failed to close overlay window:", closeError);
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col bg-gray-100"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        minWidth: '100vw',
        minHeight: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh'
      }}
    >
      {/* Top section - clean white/light background */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-normal text-gray-700 tracking-wide">
            YOU DESERVE A WELL DEFINED REST
          </h1>
        </div>
      </div>

      {/* Bottom section - brown/orange colored bar */}
      <div className="bg-primary text-primary-foreground px-8 py-6 w-full">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          {/* Left side - Logo and branding */}
          <div className="flex items-center space-x-3">
            <div className="text-2xl">🍅</div>
            <span className="text-xl font-bold tracking-wide">POMOTORO</span>
          </div>

          {/* Right side - Timer and controls */}
          <div className="flex items-center space-x-8">
            {/* Timer display */}
            <div className="text-right">
              <div className="text-6xl md:text-7xl font-light tabular-nums">
                {minutes}
              </div>
              <div className="text-sm tracking-[0.2em] opacity-90 uppercase">
                MINUTES REMAINING
              </div>
              <div className="text-xs opacity-75 mt-1">
                THIS OVERLAY WILL DISAPPEAR AFTER THE TIMER
              </div>
            </div>

            {/* Skip button - minimal style */}
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm border border-primary-foreground/30 rounded hover:bg-primary-foreground/10 transition-colors"
            >
              Skip Rest
            </button>
          </div>
        </div>
        
        {/* ESC hint at bottom */}
        <div className="text-center mt-4">
          <p className="text-xs opacity-60">
            Press ESC to skip this rest period
          </p>
        </div>
      </div>
    </div>
  );
}
