import type { PomodoroSetup } from "./pomodoro";
import type { Task } from "./task";

export interface SessionDetails {
  title: string;
  description?: string;
  name?: string;
}

export interface Session {
  pomodoroSetup: PomodoroSetup;
  tasks: Task[];
  sessionDetails: SessionDetails;
}
