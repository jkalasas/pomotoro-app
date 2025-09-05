import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { Bug, Pause, Play, RefreshCw } from "lucide-react";

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
import { useEffect, useRef } from "react";
import { useWindowStore } from "~/stores/window";
import { apiClient } from "~/lib/api";
import { SessionSelector } from "~/components/pomotoro/session-selector";
import { SessionFeedbackModal, type FocusLevel } from "~/components/pomodoro/session-feedback-modal";
import { showTestFeatures } from "~/lib/env";

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

  // Timer ticking, backend sync and rest-overlay are handled centrally by
  // the pomodoro store background ticker so page-level intervals are not
  // required. The page simply reads state from the store for rendering.

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

      <PomodoroTimer time={time} endTime={maxTime} />

      <div className="text-center mb-4">
        <p className="text-lg font-medium">Phase: {phase}</p>
        {currentTaskId && (
          <p className="text-sm text-muted-foreground">
            Task ID: {currentTaskId}
          </p>
        )}
        {showRestOverlay && (
          <p className="text-sm text-orange-600 font-medium mt-1">
            🍅 Rest Overlay Active
          </p>
        )}
      </div>

      <div className="flex justify-center gap-2 mb-4">
        {!isRunning ? (
          <Button type="button" onClick={startTimer} disabled={isLoading}>
            <Play className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={pauseTimer} disabled={isLoading}>
            <Pause className="size-4" />
          </Button>
        )}
        <Button type="button" onClick={resetTimer} disabled={isLoading}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {showTestFeatures() && (
        <div className="border-t pt-4 mt-6">
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold mb-2">Test Features</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Use these buttons to test the invasive rest overlay functionality
            </p>
          </div>
          
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              onClick={async () => {
                // For testing - simulate entering break phase
                setShowRestOverlay(true);
                // Also update backend to reflect break state
                await updateTimer({
                  phase: "short_break",
                  time_remaining: 300, // 5 minutes
                });
              }}
              disabled={isLoading}
              variant="outline"
              className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
            >
              <Bug className="size-4 mr-2" />
              Test Rest Overlay (5min)
            </Button>
            
            <Button
              type="button"
              onClick={async () => {
                // Test with different duration
                setShowRestOverlay(true);
                await updateTimer({
                  phase: "long_break",
                  time_remaining: 900, // 15 minutes
                });
              }}
              disabled={isLoading}
              variant="outline"
              className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
            >
              <Bug className="size-4 mr-2" />
              Test Long Break (15min)
            </Button>

            <Button
              type="button"
              onClick={async () => {
                // Directly test phase completion logic
                const store = usePomodoroStore.getState();
                console.log('Current state before phase completion:', {
                  phase: store.phase,
                  sessionId: store.sessionId,
                  pomodorosCompleted: store.pomodorosCompleted
                });
                alert(`Starting phase completion test. Current: ${store.phase} -> next phase`);
                await store.handlePhaseCompletion();
              }}
              disabled={isLoading}
              variant="outline"
              className="bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
            >
              <Bug className="size-4 mr-2" />
              Direct Phase Completion
            </Button>

            <Button
              type="button"
              onClick={async () => {
                // Set a very short timer for testing
                await updateTimer({
                  time_remaining: 5, // 5 seconds
                  is_running: true
                });
              }}
              disabled={isLoading}
              variant="outline"
              className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
            >
              <Bug className="size-4 mr-2" />
              5-Second Timer Test
            </Button>

            <Button
              type="button"
              onClick={async () => {
                // Test timer completion and phase transition
                await simulateTimerCompletion();
              }}
              disabled={isLoading}
              variant="outline"
              className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
            >
              <Bug className="size-4 mr-2" />
              Simulate Timer Complete
            </Button>

            <Button
              type="button"
              onClick={() => {
                // Force hide overlay for testing
                setShowRestOverlay(false);
              }}
              disabled={isLoading}
              variant="outline"
              className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            >
              <Bug className="size-4 mr-2" />
              Force Hide Overlay
            </Button>
          </div>
        </div>
      )}

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
