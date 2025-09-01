import { useEffect, useState } from "react";
import type { PomodoroState } from "~/stores/pomodoro";

interface Props {
  timeValue?: number;
  maxTimeValue: number;
  onTimesUp?: () => void;
}

export function useTimer({ maxTimeValue, onTimesUp, timeValue }: Props) {
  const [maxTime, setMaxTime] = useState(maxTimeValue);
  const [time, setTime] = useState(timeValue ?? maxTimeValue);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (isRunning && time === 0) {
      onTimesUp?.();
      setIsRunning(false);
    } else if (isRunning && time > 0) {
      timer = setTimeout(() => {
        setTime(time - 1);
      }, 1000);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [time, isRunning]);

  const startTimer = () => {
    setIsRunning(true);
  };

  const pauseTimer = () => {
    setIsRunning(false);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTime(maxTime);
  };

  return {
    maxTime,
    time,
    isRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    setMaxTime,
    setTime,
  };
}
