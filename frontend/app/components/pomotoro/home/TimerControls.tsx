import { memo } from "react";
import { Button } from "~/components/ui/button";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Plus,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { usePomodoroStore } from "~/stores/pomodoro";
import { useSchedulerStore } from "~/stores/scheduler";

export const TimerControls = memo(function TimerControls() {
  const isRunning = usePomodoroStore((state) => state.isRunning);
  const isLoading = usePomodoroStore((state) => state.isLoading);
  const phase = usePomodoroStore((state) => state.phase);
  
  // Actions
  const startTimer = usePomodoroStore((state) => state.startTimer);
  const pauseTimer = usePomodoroStore((state) => state.pauseTimer);
  const resetTimer = usePomodoroStore((state) => state.resetTimer);
  const extendRest = usePomodoroStore((state) => state.extendRest);
  const skipRest = usePomodoroStore((state) => state.skipRest);

  const currentTask = useSchedulerStore((state) => state.getCurrentTask());
  const completeScheduledTask = useSchedulerStore((state) => state.completeScheduledTask);

  if (!currentTask) return null;

  const isBreak = phase === "short_break" || phase === "long_break";

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Main Timer Controls (Start/Pause/Reset) */}
      <div className="flex gap-2 sm:gap-3">
        <Button
          className="flex flex-1 items-center gap-2 sm:gap-3 text-sm sm:text-base"
          variant="default"
          onClick={async () => {
            try {
              if (isRunning) {
                await pauseTimer();
              } else {
                await startTimer();
              }
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to start timer"
              );
            }
          }}
          disabled={isLoading}
        >
          {isRunning ? (
            <>
              <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Pause Task</span>
              <span className="sm:hidden">Pause</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Start Task</span>
              <span className="sm:hidden">Start</span>
            </>
          )}
        </Button>
        <Button
          className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4"
          variant="outline"
          onClick={async () => {
            try {
              await resetTimer();
            } catch (error) {
              toast.error("Failed to reset timer");
            }
          }}
          disabled={isLoading}
        >
          <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>

      {/* Complete Task Button */}
      <Button
        className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base"
        variant="outline"
        onClick={() => {
          if (isBreak) {
            toast.info('Finish your break before completing tasks.');
            return;
          }
          if (currentTask) {
            completeScheduledTask(currentTask.id);
          }
        }}
        disabled={isBreak}
      >
        <Check className="h-4 w-4 sm:h-5 sm:w-5" />
        <span className="hidden sm:inline">Mark Task Complete</span>
        <span className="sm:hidden">Complete</span>
      </Button>

      {/* Break Controls */}
      {isBreak && (
        <div className="flex gap-2 sm:gap-3">
          <Button
            className="flex-1 flex items-center gap-2 sm:gap-3 text-sm sm:text-base"
            variant="outline"
            onClick={async () => {
              try {
                await extendRest();
                toast.success("Break extended");
              } catch (error) {
                toast.error("Failed to extend break");
              }
            }}
            disabled={isLoading}
          >
            <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Extend Break</span>
            <span className="sm:hidden">Extend</span>
          </Button>

          <Button
            className="flex-1 flex items-center gap-2 sm:gap-3 text-sm sm:text-base"
            variant="outline"
            onClick={async () => {
              try {
                await skipRest();
              } catch (error) {
                toast.error("Failed to skip break");
              }
            }}
            disabled={isLoading}
          >
            <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Skip Break</span>
            <span className="sm:hidden">Skip</span>
          </Button>
        </div>
      )}
    </div>
  );
});
