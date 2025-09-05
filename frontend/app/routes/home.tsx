import { Link } from "react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useWindowStore } from "~/stores/window";
import type { Route } from "./+types/home";
import { useTaskStore } from "~/stores/tasks";
import { useAnalyticsStore } from "~/stores/analytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Check,
  CloudLightning,
  Edit2,
  FilePenLine,
  Pause,
  Play,
  Plus,
  PlusCircle,
  RotateCcw,
  Settings,
  Timer,
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
import { SessionFeedbackModal, type FocusLevel } from "~/components/pomodoro/session-feedback-modal";
import { apiClient } from "~/lib/api";
import { showTestFeatures } from "~/lib/env";

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
  const analyticsStore = useAnalyticsStore();

  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<GeneratedSessionInfo>();
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isSessionSettingsOpen, setIsSessionSettingsOpen] = useState(false);
  const [sessionSettings, setSessionSettings] = useState({
    focus_duration: 25,
    short_break_duration: 5,
    long_break_duration: 15,
    long_break_per_pomodoros: 4,
  });

  // Load user data and sessions on mount
  useEffect(() => {
    if (authStore.token && !authStore.user) {
      authStore.loadUser();
    }
    if (authStore.user) {
      tasksStore.loadSessions();
      // Also refresh current session if pomodoro store has an active session
      if (pomodoroStore.sessionId && !tasksStore.currentSession) {
        tasksStore.loadSession(pomodoroStore.sessionId);
      }
    }
  }, [authStore.token, authStore.user, pomodoroStore.sessionId]);

  // Listen for session completion events to refresh data
  useEffect(() => {
    const handleSessionCompleted = () => {
      console.log('Session completed - refreshing data');
      tasksStore.refreshAllData();
      // Also refresh analytics
      analyticsStore.updateDailyStats();
      analyticsStore.fetchInsights();
    };

    const handleSessionReset = () => {
      console.log('Session reset - refreshing data');
      tasksStore.refreshAllData();
      // Refresh analytics after session reset
      analyticsStore.updateDailyStats();
    };

    const handleTaskCompleted = () => {
      console.log('Task completed/uncompleted - refreshing current session');
      if (tasksStore.currentSession) {
        tasksStore.loadSession(tasksStore.currentSession.id);
      }
      // Update daily stats after task changes
      analyticsStore.updateDailyStats();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('session-completed', handleSessionCompleted);
      window.addEventListener('session-reset', handleSessionReset);
      window.addEventListener('task-completed', handleTaskCompleted);
      window.addEventListener('task-uncompleted', handleTaskCompleted);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('session-completed', handleSessionCompleted);
        window.removeEventListener('session-reset', handleSessionReset);
        window.removeEventListener('task-completed', handleTaskCompleted);
        window.removeEventListener('task-uncompleted', handleTaskCompleted);
      }
    };
  }, [tasksStore]);

  // Timer ticking, backend sync and completion handling are performed by
  // the centralized pomodoro store background ticker. The Home page just
  // renders the current store state.

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

  const openSessionSettings = () => {
    if (tasksStore.currentSession) {
      setSessionSettings({
        focus_duration: tasksStore.currentSession.focus_duration,
        short_break_duration: tasksStore.currentSession.short_break_duration,
        long_break_duration: tasksStore.currentSession.long_break_duration,
        long_break_per_pomodoros: tasksStore.currentSession.long_break_per_pomodoros,
      });
      setIsSessionSettingsOpen(true);
    }
  };

  const saveSessionSettings = async () => {
    if (tasksStore.currentSession) {
      try {
        await tasksStore.updateSession(tasksStore.currentSession.id, sessionSettings);
        
        // If this session is currently active in the Pomodoro timer, refresh it
        if (pomodoroStore.sessionId === tasksStore.currentSession.id) {
          await pomodoroStore.loadActiveSession();
        }
        
        setIsSessionSettingsOpen(false);
        toast.success("Session settings updated!");
      } catch (error) {
        console.error("Failed to update session settings:", error);
        toast.error("Failed to update session settings");
      }
    }
  };

  const cancelSessionSettings = () => {
    setIsSessionSettingsOpen(false);
    setSessionSettings({
      focus_duration: 25,
      short_break_duration: 5,
      long_break_duration: 15,
      long_break_per_pomodoros: 4,
    });
  };

  return (
    <main className="flex flex-col items-center justify-center pb-4 gap-3 p-5">
      <div className="w-full flex justify-between">
        <SidebarTrigger />
        <div className="flex justify-end gap-3">
          <Link to="/analytics">
            <Button variant="outline" className="inline-flex items-center gap-2">
              <CloudLightning />
              <span>Analytics</span>
            </Button>
          </Link>
          <Link to="/pomodoro">
            <Button variant="outline" className="inline-flex items-center gap-2">
              <Timer />
              <span>Pomodoro Timer</span>
            </Button>
          </Link>
          
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

      {/* Session Settings Dialog */}
      <Dialog open={isSessionSettingsOpen} onOpenChange={setIsSessionSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session Settings</DialogTitle>
            <DialogDescription>
              Customize the timing for your Pomodoro session
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="focus-duration">Focus Duration (minutes)</Label>
              <Input
                id="focus-duration"
                type="number"
                min="1"
                max="120"
                value={sessionSettings.focus_duration}
                onChange={(e) => setSessionSettings({
                  ...sessionSettings,
                  focus_duration: parseInt(e.target.value) || 25
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="short-break">Short Break Duration (minutes)</Label>
              <Input
                id="short-break"
                type="number"
                min="1"
                max="30"
                value={sessionSettings.short_break_duration}
                onChange={(e) => setSessionSettings({
                  ...sessionSettings,
                  short_break_duration: parseInt(e.target.value) || 5
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break">Long Break Duration (minutes)</Label>
              <Input
                id="long-break"
                type="number"
                min="1"
                max="60"
                value={sessionSettings.long_break_duration}
                onChange={(e) => setSessionSettings({
                  ...sessionSettings,
                  long_break_duration: parseInt(e.target.value) || 15
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break-frequency">Long Break After (pomodoros)</Label>
              <Input
                id="long-break-frequency"
                type="number"
                min="1"
                max="10"
                value={sessionSettings.long_break_per_pomodoros}
                onChange={(e) => setSessionSettings({
                  ...sessionSettings,
                  long_break_per_pomodoros: parseInt(e.target.value) || 4
                })}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <Button 
              variant="outline" 
              onClick={cancelSessionSettings}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={saveSessionSettings}
              className="flex-1"
            >
              Save Settings
            </Button>
          </div>
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
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={startEditingSessionName}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={openSessionSettings}>
                    <Settings className="size-4" />
                  </Button>
                </div>
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
            
            {pomodoroStore.showRestOverlay && (
              <p className="text-center text-sm text-orange-600 font-medium">
                🍅 Rest Overlay Active
              </p>
            )}

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

              {tasksStore.currentSession && !tasksStore.currentSession.completed && (
                <Button
                  variant="outline"
                  className="flex items-center gap-3"
                  onClick={() => {
                    tasksStore.completeSessionManually();
                  }}
                >
                  <FilePenLine />
                  <span>Complete Session</span>
                </Button>
              )}
              
              {showTestFeatures() && (
                <div className="border-t pt-3 mt-3">
                  <p className="text-sm text-muted-foreground mb-2 text-center">Test Features</p>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2 bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                      onClick={async () => {
                        // Test rest overlay with 5 minutes - create new overlay window
                        await pomodoroStore.updateTimer({
                          phase: "short_break",
                          time_remaining: 300, // 5 minutes
                        });
                        pomodoroStore.setShowRestOverlay(true);
                      }}
                      disabled={pomodoroStore.isLoading}
                    >
                      <Timer />
                      <span>Test Rest Overlay (5min)</span>
                    </Button>
                  
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                      onClick={async () => {
                        // Test long break overlay - create new overlay window
                        await pomodoroStore.updateTimer({
                          phase: "long_break",
                          time_remaining: 900, // 15 minutes
                        });
                        pomodoroStore.setShowRestOverlay(true);
                      }}
                      disabled={pomodoroStore.isLoading}
                    >
                      <Timer />
                      <span>Test Long Break (15min)</span>
                    </Button>
                  
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2 bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                      onClick={async () => {
                        // Force close overlay window
                        const windowStore = useWindowStore.getState();
                        await windowStore.closeOverlayWindow();
                        pomodoroStore.setShowRestOverlay(false);
                      }}
                      disabled={pomodoroStore.isLoading}
                    >
                      <X />
                      <span>Force Hide Overlay</span>
                    </Button>
                  </div>
                </div>
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
                    disabled={session.completed}
                    className={session.completed ? "opacity-50" : ""}
                    onClick={async () => {
                      try {
                        await tasksStore.loadSession(session.id);
                        await pomodoroStore.setSession(session.id);
                      } catch (error) {
                        console.error("Failed to start session:", error);
                        // You could add a toast notification here
                      }
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {session.completed && <Check className="size-3" />}
                      {session.name || session.description}
                    </span>
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
                          <Button
                            size="sm"
                            variant={task.completed ? "outline" : "default"}
                            onClick={() => {
                              if (task.completed) {
                                tasksStore.uncompleteTask(task.id);
                              } else {
                                tasksStore.completeTask(task.id);
                              }
                            }}
                          >
                            {task.completed ? (
                              <span className="flex items-center gap-1">
                                <RotateCcw className="size-4" />
                                Undo
                              </span>
                            ) : (
                              <Check className="size-4" />
                            )}
                          </Button>
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
                        if (task.completed) {
                          tasksStore.uncompleteTask(task.id);
                        } else {
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

      {/* Session Feedback Modal */}
      {pomodoroStore.pendingSessionCompletion && (
        <SessionFeedbackModal
          isOpen={pomodoroStore.showFeedbackModal}
          onClose={() => pomodoroStore.setShowFeedbackModal(false)}
          onSubmit={async (focusLevel: FocusLevel, reflection?: string) => {
            try {
              await pomodoroStore.submitSessionFeedback(focusLevel, reflection);
              toast.success("Session feedback submitted successfully!");
              // Refresh analytics after successful submission
              analyticsStore.fetchEvents();
              analyticsStore.updateDailyStats();
            } catch (error) {
              console.error("Failed to submit feedback:", error);
              toast.error("Failed to submit feedback. Please try again.");
            }
          }}
          sessionName={pomodoroStore.pendingSessionCompletion.sessionName}
          focusDuration={pomodoroStore.pendingSessionCompletion.focusDuration}
          tasksCompleted={pomodoroStore.pendingSessionCompletion.completedTasks}
          tasksTotal={pomodoroStore.pendingSessionCompletion.totalTasks}
        />
      )}
    </main>
  );
}
