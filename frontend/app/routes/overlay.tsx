import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { useSearchParams } from "react-router";
import { Logo } from "~/components/ui/logo";
import { useAppSettings } from "~/stores/settings";
import { useAnalyticsStore } from "~/stores/analytics";

export default function Overlay() {
  const appSettings = useAppSettings();
  const analyticsStore = useAnalyticsStore();
  const [searchParams] = useSearchParams();
  
  // Get time from URL parameters, fallback to 300 seconds (5 minutes)
  const initialTime = parseInt(searchParams.get('time') || '300', 10);
  const [timeRemaining, setTimeRemaining] = useState(initialTime);

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

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) {
      // When the overlay timer naturally reaches zero, simply close
      // the overlay window without emitting the 'skip-rest' event.
      // Emitting 'skip-rest' causes the skipRest() handler in the
      // main window to set is_running: false on the backend which can
      // race with the main store's phase transition logic that should
      // set is_running: true when moving back to focus. Only emit
      // 'skip-rest' for user-initiated skips (button / ESC).
      try {
        analyticsStore.logEvent('break_overlay_auto_closed', {
          reason: 'timer_expired',
          initial_time: initialTime,
          time_remaining: 0,
          closed_at: new Date().toISOString(),
        });
      } catch {}
      (async () => {
        try {
          const currentWindow = getCurrentWindow();
          await currentWindow.close();
        } catch (error) {
          console.error('Failed to close overlay window on natural expiry:', error);
        }
      })();
      return;
    }

    const timer = setTimeout(() => {
      setTimeRemaining(timeRemaining - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeRemaining]);

  // Listen for break-extended events to keep countdown in sync
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        unlisten = await listen<{ added_seconds: number; time_remaining: number }>('break-extended', (event) => {
          const { time_remaining } = event.payload || { added_seconds: 0, time_remaining: timeRemaining };
          if (typeof time_remaining === 'number' && time_remaining > 0) {
            setTimeRemaining(time_remaining);
          }
        });
      } catch {
        // ignore if tauri not available
      }
    })();
    return () => { try { unlisten && unlisten(); } catch {} };
  }, []);

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

  // Extend the current break by the original break duration (handled in main window)
  const handleExtend = async () => {
    try {
      // Emit without payload; main window uses configured break duration
      await emit('extend-rest');
      // Do not adjust local timer here; will sync via 'break-extended' event
    } catch (error) {
      console.error('Failed to extend rest:', error);
    }
  };

  // Close overlay without skipping the rest period in the main window.
  // This only closes the overlay window and does not emit 'skip-rest'.
  const handleClose = async () => {
    try {
      try {
        analyticsStore.logEvent('break_overlay_closed', {
          reason: 'manual',
          time_remaining: timeRemaining,
          closed_at: new Date().toISOString(),
        });
      } catch {}
      const currentWindow = getCurrentWindow();
      await currentWindow.close();
    } catch (error) {
      console.error('Failed to close overlay window:', error);
    }
  };

  const videoSrc = appSettings.waitingVideo.startsWith('blob:')
    ? appSettings.waitingVideo
    : appSettings.waitingVideo.startsWith('/')
    ? appSettings.waitingVideo
    : `/videos/${appSettings.waitingVideo}`;

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
      {/* Top section with small looping video and message */}
      <div className="flex-1 flex flex-col items-center justify-center w-full p-4 gap-6">
        <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden shadow-lg border border-black/5 bg-black/60">
          <video
            key={appSettings.waitingVideo}
            src={videoSrc}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>
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
            <Logo showText className="h-8 w-8" textClassName="text-xl font-bold tracking-wide" />
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

            {/* Controls - Skip (emit) and Close (dismiss only) */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-sm border border-primary-foreground/30 rounded hover:bg-primary-foreground/10 transition-colors"
              >
                Skip Rest
              </button>

              <button
                onClick={handleExtend}
                className="px-4 py-2 text-sm border border-primary-foreground/30 rounded hover:bg-primary-foreground/10 transition-colors"
                title="Extend by original break duration"
              >
                Extend Break
              </button>

              <button
                onClick={handleClose}
                className="px-3 py-2 text-sm bg-primary-foreground/5 border border-primary-foreground/10 rounded hover:bg-primary-foreground/10 transition-colors"
                title="Close overlay without skipping the rest"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        
        {/* Footer hint */}
        <div className="text-center mt-4">
            <p className="text-xs opacity-60">
              Use Skip to end rest early, or Close to hide this overlay
            </p>
        </div>
      </div>
    </div>
  );
}
