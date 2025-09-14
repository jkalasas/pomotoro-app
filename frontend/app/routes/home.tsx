import { useEffect, useMemo, useState } from "react";
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
  Clock,
  FilePenLine,
  Pause,
  Play,
  Plus,
  PlusCircle,
  RotateCcw,
  Settings,
  Trash2,
  SkipForward,
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
import { useIsMobile } from "~/hooks/use-mobile";
import { useIsXL } from "~/hooks/use-xl";
import {
  SessionEditorDialog,
  type GeneratedSessionInfo,
} from "~/components/pomotoro/session-editor-dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

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
  const isMobile = useIsMobile();
  const isXL = useIsXL();

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
      // loadActiveSession already syncs settings with the current task/session
      pomodoroStore.loadActiveSession();
    }
  }, [authStore.user]);

  useEffect(() => {
    if (
      pomodoroStore.sessionId &&
      Number.isInteger(pomodoroStore.sessionId) &&
      pomodoroStore.sessionId > 0 &&
      !tasksStore.currentSession
    ) {
      tasksStore.loadSession(pomodoroStore.sessionId);
    }
  }, [pomodoroStore.sessionId]);

  // Listen for session completion events to refresh data
  useEffect(() => {
    const handleSessionCompleted = () => {
      tasksStore.refreshAllData();
      // Defer analytics updates to prevent blocking UI
      setTimeout(() => {
        analyticsStore.updateTodayStats();
      }, 100);
    };

    const handleSessionReset = () => {
      tasksStore.refreshAllData();
      // Defer analytics update
      setTimeout(() => analyticsStore.updateTodayStats(), 100);
    };

    const handleTaskCompleted = () => {
      // Session/task data refresh is already triggered by the stores.
      // Only update analytics here to avoid duplicate network calls.
      setTimeout(() => analyticsStore.updateTodayStats(), 50);
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
    return Math.ceil(
      sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0) /
        sessionInfo.pomodoroSetup.duration
    );
  }, [sessionInfo]);

  const totalTimeMinutes = useMemo(() => {
    if (!sessionInfo) return 0;
    return sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0);
  }, [sessionInfo]);

  // Visible schedule: exclude archived tasks (centralized filter)
  const visibleSchedule = useMemo(() => {
    return (schedulerStore.currentSchedule || []).filter(
      (t: any) => !t.archived
    );
  }, [schedulerStore.currentSchedule]);

  // Generate session from plain text project details using recommendations API
  const startGenerating = async (projectDetails: string) => {
    try {
      setIsGenerating(true);
      toast.info("Generating session recommendations...");
      const resp = (await apiClient.getRecommendations(
        projectDetails
      )) as RecommendationResponse;

      const generated: GeneratedSessionInfo = {
        sessionDetails: {
          title: resp.session?.name || "Generated Session",
          description: resp.session?.description || "",
        },
        pomodoroSetup: {
          duration: resp.pomodoro_config?.focus_duration || 25,
          shortBreakTime: resp.pomodoro_config?.short_break_duration || 5,
          longBreakTime: resp.pomodoro_config?.long_break_duration || 15,
          pomodorosBeforeLongBreak:
            resp.pomodoro_config?.long_break_per_pomodoros || 4,
        },
        tasks: (resp.generated_tasks || []).map((t, i) => ({
          id: `temp-${Date.now()}-${i}`,
          name: t.name,
          description: "",
          difficulty: TaskDifficulty.MEDIUM,
          estimatedTime: t.estimated_completion_time || 25,
          category: t.category || "General",
        })),
      };

      setSessionInfo(generated);
      setIsSessionDialogOpen(true);
    } catch (err) {
      console.error("Failed to generate recommendations:", err);
      toast.error("Failed to generate session recommendations");
    } finally {
      setIsGenerating(false);
    }
  };

  // Create session on backend from generated session info
  const createSessionFromGenerated = async () => {
    if (!sessionInfo) return;
    try {
      const payload = {
        name: sessionInfo.sessionDetails.title,
        description: sessionInfo.sessionDetails.description,
        pomodoro_config: {
          focus_duration: sessionInfo.pomodoroSetup.duration,
          short_break_duration: sessionInfo.pomodoroSetup.shortBreakTime,
          long_break_duration: sessionInfo.pomodoroSetup.longBreakTime,
          long_break_per_pomodoros:
            sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak,
        },
        tasks: sessionInfo.tasks.map((t) => ({
          name: (t.name || "").trim() || "Untitled Task",
          category: t.category,
          estimated_completion_time: t.estimatedTime,
        })),
      };

      await apiClient.createSession(payload as any);
      toast.success("Session created");
      setIsSessionDialogOpen(false);
      // Refresh sessions/tasks
      tasksStore.loadSessions();
    } catch (err) {
      console.error("Failed to create session:", err);
      toast.error("Failed to create session");
    }
  };

  const openSessionSettings = () => setIsSessionSettingsOpen(true);

  const cancelSessionSettings = () => {
    setIsSessionSettingsOpen(false);
    setSessionSettings(pomodoroStore.settings);
  };

  const saveSessionSettings = () => {
    const {
      focus_duration,
      short_break_duration,
      long_break_duration,
      long_break_per_pomodoros,
    } = sessionSettings;
    if (
      !focus_duration ||
      !short_break_duration ||
      !long_break_duration ||
      !long_break_per_pomodoros
    ) {
      toast.error(
        "Please fill all session settings with values greater than 0"
      );
      return;
    }
    pomodoroStore.updateSettings(sessionSettings);
    setIsSessionSettingsOpen(false);
    toast.success("Session settings saved");
  };

  return (
    <main className="flex flex-col pb-6 gap-6 p-6 bg-gradient-to-br from-background via-background to-muted/30 min-h-screen rounded-xl">
      <div className="w-full flex justify-between items-center backdrop-blur-sm bg-card/60 rounded-2xl p-4 border border-border/50 shadow-sm">
        <SidebarTrigger />
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {visibleSchedule.filter((t) => !t.completed).length > 0
                ? `${Math.floor(
                    visibleSchedule
                      .filter((task) => !task.completed)
                      .reduce(
                        (acc, task) => acc + task.estimated_completion_time,
                        0
                      ) / 60
                  )} hours remaining`
                : "No schedule"}
            </span>
          </div>
          {sessionInfo && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSessionDialogOpen(true)}
              className="rounded-full"
            >
              Session Details
            </Button>
          )}

          <Dialog
            open={isNewSessionDialogOpen}
            onOpenChange={(open) => setIsNewSessionDialogOpen(open)}
          >
            <DialogTrigger disabled={isGenerating}>
              <Button
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 rounded-full px-6"
                disabled={isGenerating}
              >
                <Plus className="h-5 w-5" />
                <span>{isGenerating ? "Generating..." : "New Session"}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
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

      <SessionEditorDialog
        isOpen={isSessionDialogOpen}
        onOpenChange={(open) => setIsSessionDialogOpen(open)}
        sessionInfo={sessionInfo || null}
        onSessionChange={setSessionInfo}
        onCreateSession={createSessionFromGenerated}
        isGenerating={isGenerating}
      />

      <Dialog
        open={isSessionSettingsOpen}
        onOpenChange={(open) => setIsSessionSettingsOpen(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session Settings</DialogTitle>
            <CardDescription>
              Customize the timing for your Pomodoro session
            </CardDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="focus-duration">Focus Duration (minutes)</Label>
              <Input
                id="focus-duration"
                type="number"
                min="1"
                max="120"
                value={
                  sessionSettings.focus_duration === 0
                    ? ""
                    : sessionSettings.focus_duration
                }
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    focus_duration: Number.isNaN(v) ? 0 : v,
                  });
                }}
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
                value={
                  sessionSettings.short_break_duration === 0
                    ? ""
                    : sessionSettings.short_break_duration
                }
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    short_break_duration: Number.isNaN(v) ? 0 : v,
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break">Long Break Duration (minutes)</Label>
              <Input
                id="long-break"
                type="number"
                min="1"
                max="60"
                value={
                  sessionSettings.long_break_duration === 0
                    ? ""
                    : sessionSettings.long_break_duration
                }
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    long_break_duration: Number.isNaN(v) ? 0 : v,
                  });
                }}
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
                value={
                  sessionSettings.long_break_per_pomodoros === 0
                    ? ""
                    : sessionSettings.long_break_per_pomodoros
                }
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    long_break_per_pomodoros: Number.isNaN(v) ? 0 : v,
                  });
                }}
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

      <div className="flex flex-col xl:flex-row gap-8 w-full items-stretch h-full">
        <Card className="flex-1 max-h-fit" ref={pomodoroWidgetRef}>
          <CardContent>
            <div className="flex flex-col items-center">
              <span className="font-bold text-center mb-1">Current Task</span>
              <span className="font-normal text-center">
                {(() => {
                  const t = schedulerStore.getCurrentTask();
                  return t
                    ? t.name?.trim() || "Untitled Task"
                    : "No active task";
                })()}
              </span>
            </div>
            <div className="mx-auto">
              <PomodoroTimer
                time={pomodoroStore.time}
                endTime={pomodoroStore.maxTime}
              />
            </div>
            <div className="-mt-4 mb-12 flex flex-col items-center">
              {schedulerStore.getCurrentTask() ? (
                <>
                  <p className="text-center">
                    {pomodoroStore.phase === "focus"
                      ? "Stay focused!"
                      : pomodoroStore.phase === "short_break"
                      ? "Short break"
                      : "Long break"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const t = pomodoroStore.time;
                      const mins =
                        Number.isFinite(t) && t >= 0 ? Math.floor(t / 60) : 0;
                      return `${mins} minute${mins === 1 ? "" : "s"} remaining`;
                    })()}
                  </p>
                </>
              ) : null}
            </div>

            {pomodoroStore.showRestOverlay && (
              <p className="text-center text-sm text-orange-600 font-medium">
                <LogoIcon className="h-5 w-5 mr-2" />
                Rest Overlay Active
              </p>
            )}

            <div className="mt-3 flex flex-col gap-3">
              {schedulerStore.getCurrentTask() && (
                <>
                  <div className="flex gap-3">
                    <Button
                      className="flex flex-1 items-center gap-3"
                      variant="default"
                      onClick={async () => {
                        try {
                          if (pomodoroStore.isRunning) {
                            await pomodoroStore.pauseTimer();
                          } else {
                            await pomodoroStore.startTimer();
                          }
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Failed to start timer"
                          );
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
                      variant="outline"
                      onClick={async () => {
                        try {
                          await pomodoroStore.resetTimer();
                        } catch (error) {
                          toast.error("Failed to reset timer");
                        }
                      }}
                      disabled={pomodoroStore.isLoading}
                    >
                      <RotateCcw />
                    </Button>
                  </div>
                </>
              )}
              {schedulerStore.getCurrentTask() && (
                <Button
                  className="flex items-center gap-3"
                  variant="outline"
                  onClick={() => {
                    const currentTask = schedulerStore.getCurrentTask();
                    if (currentTask) {
                      schedulerStore.completeScheduledTask(currentTask.id);
                    }
                  }}
                >
                  <Check />
                  <span>Mark Task Complete</span>
                </Button>
              )}

              {schedulerStore.getCurrentTask() &&
                (pomodoroStore.phase === "short_break" ||
                  pomodoroStore.phase === "long_break") && (
                  <div className="flex gap-3">
                    <Button
                      className="flex items-center gap-3"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await pomodoroStore.extendRest();
                          toast.success("Break extended");
                        } catch (error) {
                          toast.error("Failed to extend break");
                        }
                      }}
                      disabled={pomodoroStore.isLoading}
                    >
                      <Plus />
                      <span>Extend Break</span>
                    </Button>

                    <Button
                      className="flex items-center gap-3"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await pomodoroStore.skipRest();
                        } catch (error) {
                          toast.error("Failed to skip break");
                        }
                      }}
                      disabled={pomodoroStore.isLoading}
                    >
                      <SkipForward />
                      <span>Skip Break</span>
                    </Button>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>

        <Card
          className="flex-2 backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl"
          style={{
            maxHeight:
              isXL && pomodoroWidgetSize.height
                ? `${pomodoroWidgetSize.height}px`
                : undefined,
          }}
        >
          <CardContent
            className={`max-h-full ${isXL ? "overflow-hidden" : ""}`}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                Schedule
              </h2>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => schedulerStore.clearSchedule()}
                  disabled={
                    !schedulerStore.currentSchedule ||
                    schedulerStore.currentSchedule.length === 0
                  }
                  className="rounded-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all duration-300"
                >
                  <Trash2 className="size-4 mr-2" />
                  Clear
                </Button>
                <ScheduleGeneratorDialog
                  onScheduleGenerated={() => {
                    // Optional: refresh sessions/schedule after generation
                    tasksStore.loadSessions();
                  }}
                />
              </div>
            </div>
            <ScrollArea className={cn(["p-3 w-full", isXL && "h-full pb-16"])}>
              <ScheduledTasksList
                sessionSettings={pomodoroStore.settings}
                onOpenSettings={openSessionSettings}
              />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-6 w-full mt-4">
        <Card className="flex-1 backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl">
          <CardContent className="">
            <h3 className="text-lg font-semibold mb-6 text-foreground flex items-center gap-2">
              Quick Checklist
            </h3>
            <div className="flex flex-col gap-3">
              {visibleSchedule.length > 0 ? (
                visibleSchedule.slice(0, 5).map((task: any, index: number) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-all duration-200 group cursor-pointer"
                    onClick={() => {
                      if (task.completed) {
                        schedulerStore.uncompleteScheduledTask(task.id);
                      } else {
                        schedulerStore.completeScheduledTask(task.id);
                      }
                    }}
                  >
                    <Checkbox
                      checked={task.completed || false}
                      onCheckedChange={() => {
                        if (task.completed) {
                          schedulerStore.uncompleteScheduledTask(task.id);
                        } else {
                          schedulerStore.completeScheduledTask(task.id);
                        }
                      }}
                      className="rounded-md"
                    />
                    <span
                      className={`flex-1 transition-all duration-200 ${
                        task.completed
                          ? "line-through text-muted-foreground"
                          : "group-hover:text-foreground"
                      }`}
                    >
                      {task.name?.trim() || "Untitled Task"}
                    </span>
                    <div className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-full">
                      {index + 1}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                    <PlusCircle className="h-8 w-8" />
                  </div>
                  <p className="font-medium">No tasks yet</p>
                  <p className="text-sm">
                    Generate a schedule to see tasks here
                  </p>
                </div>
              )}
              {visibleSchedule.length > 5 && (
                <div className="text-xs text-muted-foreground mt-1">
                  +{visibleSchedule.length - 5} more tasks in full schedule
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
              analyticsStore.updateTodayStats();
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
