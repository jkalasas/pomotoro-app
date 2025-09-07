import { useEffect, useMemo, useState, useRef } from "react";
import { useWindowStore } from "~/stores/window";
import type { Route } from "./+types/home";
import { useTaskStore } from "~/stores/tasks";
import { useAnalyticsStore } from "~/stores/analytics";
import { useSchedulerStore } from "~/stores/scheduler";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { LogoIcon } from "~/components/ui/logo";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Check,
  FilePenLine,
  Pause,
  Play,
  Plus,
  PlusCircle,
  RotateCcw,
  Settings,
  Trash2,
} from "lucide-react";
import { ScheduleGeneratorDialog } from "~/components/pomotoro/schedule-generator-dialog";
import { ScheduledTasksList } from "~/components/pomotoro/scheduled-tasks-list";
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
import {
  SessionFeedbackModal,
  type FocusLevel,
} from "~/components/pomodoro/session-feedback-modal";
import { apiClient } from "~/lib/api";
import useElementSize from "~/hooks/use-element-size";
import { 
  SessionEditorDialog,
  type GeneratedSessionInfo,
} from "~/components/pomotoro/session-editor-dialog";

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
  session: {
    name: string;
    description: string;
  };
  generated_tasks: GeneratedTask[];
  pomodoro_config: PomodoroConfig;
  total_estimated_time: number;
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
  const schedulerStore = useSchedulerStore();

  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<GeneratedSessionInfo>();
  const [isSessionSettingsOpen, setIsSessionSettingsOpen] = useState(false);
  const [sessionSettings, setSessionSettings] = useState({
    focus_duration: 25,
    short_break_duration: 5,
    long_break_duration: 15,
    long_break_per_pomodoros: 4,
  });

  const [pomodoroWidgetRef, pomodoroWidgetSize] = useElementSize();

  // Load user data and sessions on mount
  useEffect(() => {
    // No logging needed for page navigation
  }, []); // Run only once on mount

  // Handle auth and data loading separately
  useEffect(() => {
    if (authStore.token && !authStore.user) {
      authStore.loadUser();
    }
  }, [authStore.token]);

  useEffect(() => {
    if (authStore.user) {
      tasksStore.loadSessions();
      pomodoroStore.loadActiveSession();
    }
  }, [authStore.user]);

  useEffect(() => {
    if (pomodoroStore.sessionId && !tasksStore.currentSession) {
      tasksStore.loadSession(pomodoroStore.sessionId);
    }
  }, [pomodoroStore.sessionId]);

  // Listen for session completion events to refresh data
  useEffect(() => {
    const handleSessionCompleted = () => {
      tasksStore.refreshAllData();
      // Defer analytics updates to prevent blocking UI
      setTimeout(() => {
        analyticsStore.updateDailyStats();
        analyticsStore.fetchInsights();
      }, 100);
    };

    const handleSessionReset = () => {
      tasksStore.refreshAllData();
      // Defer analytics update
      setTimeout(() => analyticsStore.updateDailyStats(), 100);
    };

    const handleTaskCompleted = () => {
      if (tasksStore.currentSession) {
        tasksStore.loadSession(tasksStore.currentSession.id);
      }
      // Defer analytics update
      setTimeout(() => analyticsStore.updateDailyStats(), 100);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("session-completed", handleSessionCompleted);
      window.addEventListener("session-reset", handleSessionReset);
      window.addEventListener("task-completed", handleTaskCompleted);
      window.addEventListener("task-uncompleted", handleTaskCompleted);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("session-completed", handleSessionCompleted);
        window.removeEventListener("session-reset", handleSessionReset);
        window.removeEventListener("task-completed", handleTaskCompleted);
        window.removeEventListener("task-uncompleted", handleTaskCompleted);
      }
    };
  }, [tasksStore]);

  // Timer ticking, backend sync and completion handling are performed by
  // the centralized pomodoro store background ticker. The Home page just
  // renders the current store state.

  const totalPomodoros = useMemo(() => {
    if (!sessionInfo) return 0;
    return Math.ceil(sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0) / sessionInfo.pomodoroSetup.duration);
  }, [sessionInfo]);

  const totalTimeMinutes = useMemo(() => {
    if (!sessionInfo) return 0;
    return sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0);
  }, [sessionInfo]);

  useEffect(() => {
    if (sessionInfo) {
      setIsSessionDialogOpen(true);
      // Only log meaningful session creation events, not dialog openings
    }
  }, [sessionInfo, analyticsStore]);

  const startGenerating = async (projectDetails: string) => {
    if (isGenerating) return;
    setIsGenerating(true);

    const toastId = toast.loading("Generating tasks...", {
      duration: Infinity,
    });

    try {
      // First generate recommendations
      const recommendations = (await apiClient.getRecommendations(
        projectDetails
      )) as RecommendationResponse;

      // Convert backend format to frontend format for display (don't create session yet)
      const sessionInfo = {
        sessionDetails: {
          title: recommendations.session.name,
          description: recommendations.session.description,
        },
        pomodoroSetup: {
          duration: recommendations.pomodoro_config.focus_duration,
          shortBreakTime: recommendations.pomodoro_config.short_break_duration,
          longBreakTime: recommendations.pomodoro_config.long_break_duration,
          pomodorosBeforeLongBreak:
            recommendations.pomodoro_config.long_break_per_pomodoros,
        },
        tasks: recommendations.generated_tasks.map(
          (task: GeneratedTask, index: number) => ({
            id: `temp-${index}`,
            name: task.name,
            description: "",
            difficulty: TaskDifficulty.MEDIUM,
            estimatedTime: task.estimated_completion_time,
            category: task.category,
          })
        ),
      };

      setSessionInfo(sessionInfo);

      // Keep session generation logging as it's a key productivity metric
      analyticsStore.logSessionGeneration(
        projectDetails,
        true,
        recommendations.generated_tasks.length
      );

      toast.success("Tasks generated successfully!", {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      // Keep failure logging for debugging
      analyticsStore.logSessionGeneration(projectDetails, false);
      
      toast.error("Failed to generate tasks", {
        id: toastId,
        duration: 5000,
      });
    }
    setIsGenerating(false);
  };

  const createSessionFromGenerated = async () => {
    if (!sessionInfo || !authStore.user || isGenerating) return;

    // Check if a session with this name already exists
    const existingSession = tasksStore.sessions.find(
      (s) => s.name === sessionInfo.sessionDetails.title || s.description === sessionInfo.sessionDetails.description
    );
    if (existingSession) {
      toast.error("A session with this name or description already exists");
      return;
    }

    try {
      const sessionData = {
        name: sessionInfo.sessionDetails.title,
        description: sessionInfo.sessionDetails.description,
        pomodoro_config: {
          focus_duration: sessionInfo.pomodoroSetup.duration,
          short_break_duration: sessionInfo.pomodoroSetup.shortBreakTime,
          long_break_duration: sessionInfo.pomodoroSetup.longBreakTime,
          long_break_per_pomodoros:
            sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak,
        },
        tasks: sessionInfo.tasks.map((task) => ({
          name: task.name,
          category: task.category,
          estimated_completion_time: task.estimatedTime,
        })),
      };

      const createdSession = await tasksStore.createSession(sessionData);
      tasksStore.setCurrentSession(createdSession);
      await pomodoroStore.setSession(createdSession.id);
      
      setIsSessionDialogOpen(false);
      setSessionInfo(undefined); // Clear the generated session info
      toast.success("Session created and started!");
    } catch (error) {
      toast.error("Failed to create session");
    }
  };

  const openSessionSettings = () => {
    // Load current settings from pomodoro store
    setSessionSettings(pomodoroStore.settings);
    setIsSessionSettingsOpen(true);
  };

  const saveSessionSettings = async () => {
    try {
      // Update pomodoro store settings
      pomodoroStore.updateSettings(sessionSettings);
      setIsSessionSettingsOpen(false);
      
      toast.success("Pomodoro settings updated!");
    } catch (error) {
      toast.error("Failed to update settings");
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
    <main className="flex flex-col pb-4 gap-4 p-5">
      <div className="w-full flex justify-between items-center">
        <SidebarTrigger />
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {schedulerStore.currentSchedule && schedulerStore.currentSchedule.length > 0
              ? `${Math.floor(
                  schedulerStore.currentSchedule
                    .filter(task => !task.completed)
                    .reduce((acc, task) => acc + task.estimated_completion_time, 0) / 60
                )} hours remaining`
              : "No schedule"}
          </span>
          {sessionInfo && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSessionDialogOpen(true)}
            >
              Session Details
            </Button>
          )}

          <Dialog
            open={isNewSessionDialogOpen}
            onOpenChange={(open) => {
              setIsNewSessionDialogOpen(open);
            }}
          >
            <DialogTrigger disabled={isGenerating}>
              <Button
                className="inline-flex items-center gap-2"
                disabled={isGenerating}
              >
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
      
      {/* Session Editor Dialog */}
      <SessionEditorDialog
        isOpen={isSessionDialogOpen}
        onOpenChange={(open) => {
          setIsSessionDialogOpen(open);
        }}
        sessionInfo={sessionInfo || null}
        onSessionChange={setSessionInfo}
        onCreateSession={createSessionFromGenerated}
        isGenerating={isGenerating}
      />

      {/* Session Settings Dialog */}
      <Dialog
        open={isSessionSettingsOpen}
        onOpenChange={(open) => {
          setIsSessionSettingsOpen(open);
        }}
      >
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
                onChange={(e) =>
                  setSessionSettings({
                    ...sessionSettings,
                    focus_duration: parseInt(e.target.value) || 25,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="short-break">
                Short Break Duration (minutes)
              </Label>
              <Input
                id="short-break"
                type="number"
                min="1"
                max="30"
                value={sessionSettings.short_break_duration}
                onChange={(e) =>
                  setSessionSettings({
                    ...sessionSettings,
                    short_break_duration: parseInt(e.target.value) || 5,
                  })
                }
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
                onChange={(e) =>
                  setSessionSettings({
                    ...sessionSettings,
                    long_break_duration: parseInt(e.target.value) || 15,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break-frequency">
                Long Break After (pomodoros)
              </Label>
              <Input
                id="long-break-frequency"
                type="number"
                min="1"
                max="10"
                value={sessionSettings.long_break_per_pomodoros}
                onChange={(e) =>
                  setSessionSettings({
                    ...sessionSettings,
                    long_break_per_pomodoros: parseInt(e.target.value) || 4,
                  })
                }
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
            <Button onClick={saveSessionSettings} className="flex-1">
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col xl:flex-row gap-6 w-full items-stretch h-full">
        {/* Pomodoro Widget */}
        <Card className="flex-1 max-h-fit" ref={pomodoroWidgetRef}>
          <CardContent>
            <div className="flex flex-col items-center">
              <span className="font-bold text-center">Current Task</span>
              <span className="font-thin text-center">
                {schedulerStore.getCurrentTask()?.name || "No active task"}
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
                <LogoIcon className="h-5 w-5 mr-2" />
                Rest Overlay Active
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
                onClick={() => {
                  pomodoroStore.resetTimer();
                }}
                disabled={pomodoroStore.isLoading}
              >
                <RotateCcw />
                <span>Reset Timer</span>
              </Button>
              {schedulerStore.getCurrentTask() && (
                <Button
                  className="flex items-center gap-3"
                  onClick={() => {
                    const currentTask = schedulerStore.getCurrentTask();
                    if (currentTask) {
                      schedulerStore.completeScheduledTask(currentTask.id);
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
        {/* AI Scheduler Widget */}
        <Card
          className="flex-2"
          style={{
            maxHeight: pomodoroWidgetSize.height
              ? `${pomodoroWidgetSize.height}px`
              : "auto",
          }}
        >
          <CardContent className="max-h-full overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold">Schedule</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => schedulerStore.clearSchedule()}
                  disabled={!schedulerStore.currentSchedule || schedulerStore.currentSchedule.length === 0}
                >
                  <Trash2 className="size-4 mr-2" />
                  Clear
                </Button>
                <ScheduleGeneratorDialog
                  onScheduleGenerated={() => {
                    // Schedule generated successfully
                  }}
                />
              </div>
            </div>
            <div className="max-h-full overflow-y-auto pb-12">
              <ScheduledTasksList 
                sessionSettings={pomodoroStore.settings}
                onOpenSettings={openSessionSettings}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex gap-5 w-full">
        <Card className="flex-1">
          <CardContent>
            <p className="font-bold">Quick Checklist</p>
            <div className="flex flex-col gap-1">
              {schedulerStore.currentSchedule &&
              schedulerStore.currentSchedule.length > 0 ? (
                schedulerStore.currentSchedule.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={task.completed || false}
                      onCheckedChange={() => {
                        if (task.completed) {
                          schedulerStore.uncompleteScheduledTask(task.id);
                        } else {
                          schedulerStore.completeScheduledTask(task.id);
                        }
                      }}
                    />
                    <span
                      className={
                        task.completed
                          ? "line-through text-muted-foreground"
                          : ""
                      }
                    >
                      {task.name}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">
                  Generate a schedule to see tasks here
                </span>
              )}
              {schedulerStore.currentSchedule &&
                schedulerStore.currentSchedule.length > 5 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    +{schedulerStore.currentSchedule.length - 5} more tasks in
                    full schedule
                  </div>
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
