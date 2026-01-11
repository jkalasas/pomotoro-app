import { memo } from "react";
import { usePomodoroStore } from "~/stores/pomodoro";
import { useSchedulerStore } from "~/stores/scheduler";
import { PomodoroTimer } from "~/components/pomotoro/charts/pomodoro-timer";

export const TimerDisplay = memo(function TimerDisplay() {
  const time = usePomodoroStore((state) => state.time);
  const maxTime = usePomodoroStore((state) => state.maxTime);
  const phase = usePomodoroStore((state) => state.phase);
  const showRestOverlay = usePomodoroStore((state) => state.showRestOverlay);
  
  // We need to know if there is a current task to show the timer
  const currentTask = useSchedulerStore((state) => state.getCurrentTask());

  if (!currentTask) {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-[256px]">
        <p className="text-muted-foreground text-center">
          No active task. Add a task to your schedule to start the timer.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto">
        <PomodoroTimer time={time} endTime={maxTime} />
      </div>
      <div className="-mt-4 mb-8 sm:mb-12 flex flex-col items-center">
        <p className="text-center font-medium">
          {phase === "focus"
            ? "Stay focused!"
            : phase === "short_break"
            ? "Short break"
            : "Long break"}
        </p>
        <p className="text-sm text-muted-foreground">
          {(() => {
            const mins =
              Number.isFinite(time) && time >= 0 ? Math.floor(time / 60) : 0;
            return `${mins} minute${mins === 1 ? "" : "s"} remaining`;
          })()}
        </p>
        {showRestOverlay && (
          <p className="text-center text-sm text-orange-600 font-medium flex items-center justify-center mt-2">
            Rest Overlay Active
          </p>
        )}
      </div>
    </>
  );
});
