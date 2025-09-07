import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";
import { LogoIcon } from "~/components/ui/logo";
import { toast } from "sonner";
import { Pause, Play, RefreshCw } from "lucide-react";

import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";

import { type ChartConfig, ChartContainer } from "~/components/ui/chart";
import { TextRoller } from "~/components/pomotoro/animations/text-roller";
import { cn } from "~/lib/utils";
import { PomodoroTimer } from "~/components/pomotoro/charts/pomodoro-timer";
import { usePomodoroStore } from "~/stores/pomodoro";
import { useAnalyticsStore } from "~/stores/analytics";
import { useEffect, useRef } from "react";
import { useWindowStore } from "~/stores/window";
import { apiClient } from "~/lib/api";
import { SessionSelector } from "~/components/pomotoro/session-selector";
import { SessionFeedbackModal, type FocusLevel } from "~/components/pomodoro/session-feedback-modal";
import { CurrentTaskDisplay } from "~/components/pomotoro/current-task-display";

const chartData = [
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
];

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  safari: {
    label: "Safari",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pomodoro" },
    { name: "description", content: "Pomdoro Timer" },
  ];
}

export default function Pomodoro() {
  const {
    time,
    maxTime,
    isRunning,
    phase,
    currentTaskId,
    startTimer,
    pauseTimer,
    loadActiveSession,
    resetTimer,
    isLoading,
    setTime,
    showRestOverlay,
    setShowRestOverlay,
    skipRest,
    updateTimer,
    showFeedbackModal,
    pendingSessionCompletion,
    setShowFeedbackModal,
    submitSessionFeedback,
  } = usePomodoroStore();

  const analyticsStore = useAnalyticsStore();

  // Timer ticking, backend sync and rest-overlay are handled centrally by
  // the pomodoro store background ticker so page-level intervals are not
  // required. The page simply reads state from the store for rendering.

  // Load active session on component mount
  useEffect(() => {
    loadActiveSession();
    // No need to log page navigation
  }, [loadActiveSession]);

  // Handle rest overlay display
  useEffect(() => {
    const isBreakPhase = phase === "short_break" || phase === "long_break";
    const shouldShowOverlay = isBreakPhase && isRunning && time > 0;
    
    if (shouldShowOverlay !== showRestOverlay) {
      setShowRestOverlay(shouldShowOverlay);
    }
  }, [phase, isRunning, time, showRestOverlay, setShowRestOverlay]);

  return (
    <main className="container mx-auto">
      <div className="flex justify-center mb-4">
        <SessionSelector />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="flex flex-col items-center">
          <PomodoroTimer time={time} endTime={maxTime} />
          
          <div className="text-center mb-4">
            <p className="text-lg font-medium">Phase: {phase}</p>
            {showRestOverlay && (
              <p className="text-sm text-orange-600 font-medium mt-1">
                <LogoIcon className="h-5 w-5 mr-2" />
                Rest Overlay Active
              </p>
            )}
          </div>

          <div className="flex justify-center gap-2 mb-4">
            {!isRunning ? (
              <Button 
                type="button" 
                onClick={() => {
                  startTimer();
                }} 
                disabled={isLoading}
              >
                <Play className="size-4" />
              </Button>
            ) : (
              <Button 
                type="button" 
                onClick={() => {
                  pauseTimer();
                }} 
                disabled={isLoading}
              >
                <Pause className="size-4" />
              </Button>
            )}
            <Button 
              type="button" 
              onClick={() => {
                resetTimer();
              }} 
              disabled={isLoading}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
        
        <div>
          <CurrentTaskDisplay />
        </div>
      </div>



      {/* Session Feedback Modal */}
      {pendingSessionCompletion && (
        <SessionFeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={async (focusLevel: FocusLevel, reflection?: string) => {
            try {
              await submitSessionFeedback(focusLevel, reflection);
              toast.success("Session feedback submitted successfully!");
            } catch (error) {
              console.error("Failed to submit feedback:", error);
              toast.error("Failed to submit feedback. Please try again.");
            }
          }}
          sessionName={pendingSessionCompletion.sessionName}
          focusDuration={pendingSessionCompletion.focusDuration}
          tasksCompleted={pendingSessionCompletion.completedTasks}
          tasksTotal={pendingSessionCompletion.totalTasks}
        />
      )}
    </main>
  );
}
