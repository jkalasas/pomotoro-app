import { Link } from "react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useWindowStore } from "~/stores/window";
import type { Route } from "./+types/home";
import { useTaskStore } from "~/stores/tasks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Check,
  CloudLightning,
  Edit2,
  FilePenLine,
  Pause,
  Play,
  Plus,
  PlusCircle,
  X,
} from "lucide-react";
import { DailyGoalChart } from "~/components/pomotoro/charts/daily-goal-chart";
import { DailyProgress } from "~/components/pomotoro/daily-progress";
import { Checkbox } from "~/components/ui/checkbox";
import TaskCheckItem from "~/components/pomotoro/tasks/task-check-item";
import { TaskScheduler } from "~/components/pomotoro/tasks/task-scheduler";
import { SessionInfoForm } from "~/components/pomotoro/forms/SessionInfoForm";
import type { Session } from "~/types/session";
import { TaskDifficulty } from "~/types/task";
import type { Task } from "~/stores/tasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
} from "~/components/ui/dialog";
import { DialogTitle } from "@radix-ui/react-dialog";
import { TaskItem } from "~/components/pomotoro/tasks/task-item";
import { toast } from "sonner";
import { formatMinutes } from "~/lib/time";
import { usePomodoroStore } from "~/stores/pomodoro";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { useAuthStore } from "~/stores/auth";
import { PomodoroTimer } from "~/components/pomotoro/charts/pomodoro-timer";
import { apiClient } from "~/lib/api";

interface GeneratedTask {
  name: string;
  category: string;
  estimated_completion_time: number;
}

interface PomodoroConfig {
  focus_duration: number;
  short_break_duration: number;
  long_break_duration: number;
  long_break_per_pomodoros: number;
}

interface RecommendationResponse {
  generated_tasks: GeneratedTask[];
  pomodoro_config: PomodoroConfig;
  total_estimated_time: number;
}

interface GeneratedSessionInfo {
  sessionDetails: {
    title: string;
    description: string;
  };
  pomodoroSetup: {
    duration: number;
    shortBreakTime: number;
    longBreakTime: number;
    pomodorosBeforeLongBreak: number;
  };
  tasks: Array<{
    id: string;
    name: string;
    description: string;
    difficulty: TaskDifficulty;
    pomodoros: number;
    category: string;
  }>;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pomotoro" },
    { name: "description", content: "Welcome to pomotoro!" },
  ];
}

export default function Home() {
  const tasksStore = useTaskStore();
  const pomodoroStore = usePomodoroStore();
  const authStore = useAuthStore();

  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<GeneratedSessionInfo>();
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState("");

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load user data and sessions on mount
  useEffect(() => {
    if (authStore.token && !authStore.user) {
      authStore.loadUser();
    }
    if (authStore.user) {
      tasksStore.loadSessions();
    }
  }, [authStore.token, authStore.user]);

  // Timer countdown effect
  useEffect(() => {
    if (pomodoroStore.isRunning && pomodoroStore.time > 0) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          pomodoroStore.setTime(pomodoroStore.time - 1);
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pomodoroStore.isRunning, pomodoroStore.time, pomodoroStore.setTime]);

  // Sync with backend periodically and handle timer completion
  useEffect(() => {
    if (pomodoroStore.time > 0 && pomodoroStore.time % 10 === 0 && pomodoroStore.isRunning) {
      // Sync time with backend every 10 seconds
      apiClient.updateActiveSession({ time_remaining: pomodoroStore.time }).catch(console.error);
    }

    if (pomodoroStore.time === 0 && pomodoroStore.isRunning) {
      // Timer completed
      apiClient.updateActiveSession({ is_running: false }).catch(console.error);
      toast.success("Pomodoro completed!");
    }
  }, [pomodoroStore.time, pomodoroStore.isRunning]);

  const totalPomodoros = useMemo(() => {
    if (!sessionInfo) return 0;
    return sessionInfo.tasks.reduce((acc, task) => acc + task.pomodoros, 0);
  }, [sessionInfo]);

  const totalTimeMinutes = useMemo(() => {
    if (!sessionInfo) return 0;
    return sessionInfo.pomodoroSetup.duration * totalPomodoros;
  }, [totalPomodoros, sessionInfo]);

  useEffect(() => {
    if (sessionInfo) {
      setIsSessionDialogOpen(true);
    }
  }, [sessionInfo]);

  const startGenerating = async (projectDetails: string) => {
    if (isGenerating) return;
    setIsGenerating(true);

    const toastId = toast.loading("Generating tasks...", {
      duration: Infinity,
    });

    try {
      // First generate recommendations
      const recommendations = await apiClient.getRecommendations(projectDetails) as RecommendationResponse;
      
      // Convert backend format to frontend format for display (don't create session yet)
      const sessionInfo = {
        sessionDetails: {
          title: projectDetails,
          description: projectDetails,
        },
        pomodoroSetup: {
          duration: recommendations.pomodoro_config.focus_duration,
          shortBreakTime: recommendations.pomodoro_config.short_break_duration,
          longBreakTime: recommendations.pomodoro_config.long_break_duration,
          pomodorosBeforeLongBreak: recommendations.pomodoro_config.long_break_per_pomodoros,
        },
        tasks: recommendations.generated_tasks.map((task: GeneratedTask, index: number) => ({
          id: `temp-${index}`,
          name: task.name,
          description: "",
          difficulty: TaskDifficulty.MEDIUM,
          pomodoros: Math.ceil(task.estimated_completion_time / recommendations.pomodoro_config.focus_duration),
          category: task.category,
        })),
      };

      setSessionInfo(sessionInfo);

      toast.success("Tasks generated successfully!", {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to generate tasks:", error);
      toast.error("Failed to generate tasks", {
        id: toastId,
        duration: 5000,
      });
    }
    setIsGenerating(false);
  };

  const createSessionFromGenerated = async () => {
    if (!sessionInfo || !authStore.user || isGenerating) return;

    // Check if a session with this description already exists
    const existingSession = tasksStore.sessions.find(s => s.description === sessionInfo.sessionDetails.title);
    if (existingSession) {
      toast.error("A session with this name already exists");
      return;
    }

    try {
      const sessionData = {
        description: sessionInfo.sessionDetails.title,
        pomodoro_config: {
          focus_duration: sessionInfo.pomodoroSetup.duration,
          short_break_duration: sessionInfo.pomodoroSetup.shortBreakTime,
          long_break_duration: sessionInfo.pomodoroSetup.longBreakTime,
          long_break_per_pomodoros: sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak,
        },
        tasks: sessionInfo.tasks.map((task) => ({
          name: task.name,
          category: task.category,
          estimated_completion_time: task.pomodoros * sessionInfo.pomodoroSetup.duration,
        })),
      };

      const createdSession = await tasksStore.createSession(sessionData);
      tasksStore.setCurrentSession(createdSession);
      await pomodoroStore.setSession(createdSession.id);
      setIsSessionDialogOpen(false);
      setSessionInfo(undefined); // Clear the generated session info
      toast.success("Session created and started!");
    } catch (error) {
      console.error("Failed to create session:", error);
      toast.error("Failed to create session");
    }
  };

  const startEditingSessionName = () => {
    if (tasksStore.currentSession) {
      setSessionNameInput(tasksStore.currentSession.name);
      setEditingSessionName(true);
    }
  };

  const saveSessionName = async () => {
    if (tasksStore.currentSession && sessionNameInput.trim()) {
      try {
        await tasksStore.updateSession(tasksStore.currentSession.id, { name: sessionNameInput.trim() });
        setEditingSessionName(false);
        toast.success("Session name updated!");
      } catch (error) {
        console.error("Failed to update session name:", error);
        toast.error("Failed to update session name");
      }
    }
  };

  const cancelEditingSessionName = () => {
    setEditingSessionName(false);
    setSessionNameInput("");
  };

  return (
    <main className="flex flex-col items-center justify-center pb-4 gap-3 p-5">
      <div className="w-full flex justify-between">
        <SidebarTrigger />
        <div className="flex justify-end gap-3">
          {sessionInfo && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSessionDialogOpen(true)}
            >
              Session Details
            </Button>
          )}

          <Dialog open={isNewSessionDialogOpen} onOpenChange={setIsNewSessionDialogOpen}>
            <DialogTrigger disabled={isGenerating}>
              <Button className="inline-flex items-center gap-2" disabled={isGenerating}>
                <Plus />
                <span>New Session</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <SessionInfoForm
                className="w-full"
                onSubmit={({ data }) => {
                  startGenerating(data.projectDetails);
                  setIsNewSessionDialogOpen(false);
                }}
                disabled={isGenerating}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{sessionInfo?.sessionDetails.title}</DialogTitle>
            <DialogDescription>
              {sessionInfo?.sessionDetails.description}
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-2 border-t border-b py-4">
            <h4 className="text-sm font-medium mb-2">Pomodoro Setup</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Focus Duration:</span>
              <span>{sessionInfo?.pomodoroSetup.duration} min</span>
              <span className="text-muted-foreground">Short Break:</span>
              <span>{sessionInfo?.pomodoroSetup.shortBreakTime} min</span>
              <span className="text-muted-foreground">Long Break:</span>
              <span>{sessionInfo?.pomodoroSetup.longBreakTime} min</span>
              <span className="text-muted-foreground">Long Break After:</span>
              <span>
                {sessionInfo?.pomodoroSetup.pomodorosBeforeLongBreak} pomodoros
              </span>
              <span className="text-muted-foreground">Total Pomodoros:</span>
              <span>{totalPomodoros} pomodoros</span>
              <span className="text-muted-foreground">Total Time:</span>
              <span>{formatMinutes(totalTimeMinutes)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Generated Tasks</h4>
            {sessionInfo?.tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>

          <Button
            type="button"
            className="mt-3 w-full"
            onClick={() => {
              setIsSessionDialogOpen(false);
              startGenerating(
                sessionInfo?.sessionDetails.title +
                  "\n" +
                  sessionInfo?.sessionDetails.description
              );
            }}
          >
            Regenerate Tasks
          </Button>
          <Button
            type="button"
            className="mt-3 w-full"
            onClick={createSessionFromGenerated}
            disabled={!sessionInfo || isGenerating}
          >
            Create Session from Tasks
          </Button>
        </DialogContent>
      </Dialog>
      <div className="flex justify-between w-full">
        <div className="flex items-center gap-2">
          {editingSessionName ? (
            <>
              <Input
                value={sessionNameInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSessionNameInput(e.target.value)}
                className="font-bold text-lg"
                placeholder="Session name"
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') saveSessionName();
                  if (e.key === 'Escape') cancelEditingSessionName();
                }}
                autoFocus
              />
              <Button size="sm" variant="ghost" onClick={saveSessionName}>
                <Check className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEditingSessionName}>
                <X className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <span className="font-bold">
                {tasksStore.currentSession?.name || "No Session Selected"}
              </span>
              {tasksStore.currentSession && (
                <Button size="sm" variant="ghost" onClick={startEditingSessionName}>
                  <Edit2 className="size-4" />
                </Button>
              )}
            </>
          )}
        </div>
        <span className="font-medium">
          {tasksStore.currentSession 
            ? `${Math.floor(tasksStore.currentSession.tasks.reduce((acc, task) => acc + task.estimated_completion_time, 0) / 60)} hours allotted`
            : "0 hours allotted"
          }
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 w-full gap-5">
        <Card className="row-span-3">
          <CardContent>
            <div className="flex flex-col items-center">
              <span className="font-bold text-center">Current Task</span>
              <span className="font-thin text-center">
                {pomodoroStore.currentTaskId
                  ? `Task ${pomodoroStore.currentTaskId}`
                  : "No active task"}
              </span>
            </div>
            <div className="mx-aut">
              <PomodoroTimer
                time={pomodoroStore.time}
                endTime={pomodoroStore.maxTime}
              />
            </div>
            <p className="text-center">
              {pomodoroStore.phase === "focus"
                ? "Stay focused!"
                : pomodoroStore.phase === "short_break"
                ? "Short break"
                : "Long break"}
            </p>

            <div className="mt-3 flex flex-col gap-3">
              <Button
                className="flex items-center gap-3"
                variant="ghost"
                onClick={() => {
                  if (pomodoroStore.isRunning) {
                    pomodoroStore.pauseTimer();
                  } else {
                    pomodoroStore.startTimer();
                  }
                }}
                disabled={pomodoroStore.isLoading}
              >
                {pomodoroStore.isRunning ? (
                  <>
                    <Pause />
                    <span>Pause Task</span>
                  </>
                ) : (
                  <>
                    <Play />
                    <span>Start Task</span>
                  </>
                )}
              </Button>
              <Button
                className="flex items-center gap-3"
                onClick={() => pomodoroStore.resetTimer()}
                disabled={pomodoroStore.isLoading}
              >
                <CloudLightning />
                <span>Reset Timer</span>
              </Button>
              {pomodoroStore.currentTaskId && (
                <Button
                  className="flex items-center gap-3"
                  onClick={() => {
                    if (pomodoroStore.currentTaskId) {
                      tasksStore.completeTask(pomodoroStore.currentTaskId);
                    }
                  }}
                >
                  <Check />
                  <span>Finish Task</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="row-span-2 col-span-2">
          <CardContent>
            <DailyProgress />
          </CardContent>
        </Card>
        <Card className="row-span-3 col-span-2">
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="font-bold">Tasks</span>
              <div className="flex gap-2">
                {tasksStore.sessions.map((session) => (
                  <Button
                    key={session.id}
                    variant={tasksStore.currentSession?.id === session.id ? "default" : "outline"}
                    size="sm"
                    onClick={async () => {
                      await tasksStore.loadSession(session.id);
                      pomodoroStore.setSession(session.id);
                    }}
                  >
                    {session.name || session.description}
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-96 overflow-y-auto">
              {tasksStore.currentSession && tasksStore.currentSession.tasks ? (
                <div className="space-y-2">
                  {tasksStore.currentSession.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3 border rounded-lg ${
                        task.completed ? "bg-muted border-border/50 opacity-75" : "bg-card border-border"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className={task.completed ? "line-through text-muted-foreground" : ""}>
                          {task.name}
                        </span>
                        <div className="flex gap-2">
                          <span className="text-sm text-muted-foreground">
                            {task.estimated_completion_time} min
                          </span>
                          {!task.completed && (
                            <Button
                              size="sm"
                              onClick={() => tasksStore.completeTask(task.id)}
                            >
                              <Check className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Category: {task.category}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {tasksStore.currentSession ? "Loading tasks..." : "Select a session to view tasks"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="place-self-stretch">
          <CardContent>
            <p className="font-bold">Checklist</p>
            <div className="flex flex-col gap-1">
              {tasksStore.currentSession?.tasks ? (
                tasksStore.currentSession.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => {
                        if (!task.completed) {
                          tasksStore.completeTask(task.id);
                        }
                      }}
                    />
                    <span className={task.completed ? "line-through text-muted-foreground" : ""}>
                      {task.name}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">No tasks available</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
