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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Clock,
  Plus,
  Trash2,
} from "lucide-react";
import { ScheduleGeneratorDialog } from "~/components/pomotoro/schedule-generator-dialog";
import { ScheduledTasksList } from "~/components/pomotoro/scheduled-tasks-list";
import { Checkbox } from "~/components/ui/checkbox";
import { SessionInfoForm } from "~/components/pomotoro/forms/SessionInfoForm";
import { TaskDifficulty } from "~/types/task";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "~/components/ui/dialog";
import { DialogTitle } from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { usePomodoroStore } from "~/stores/pomodoro";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { useAuthStore } from "~/stores/auth";
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
import { TimerDisplay } from "~/components/pomotoro/home/TimerDisplay";
import { TimerControls } from "~/components/pomotoro/home/TimerControls";

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
  const authStore = useAuthStore();
  const analyticsStore = useAnalyticsStore();
  const schedulerStore = useSchedulerStore();
  const isMobile = useIsMobile();
  const isXL = useIsXL();

  // Access specific pomodoro state needed for layout/logic, BUT NOT timer ticks
  const pomodoroSettings = usePomodoroStore(state => state.settings);
  const pomodoroPhase = usePomodoroStore(state => state.phase);
  const updatePomodoroSettings = usePomodoroStore(state => state.updateSettings); 
  // We need to trigger these actions but they don't cause renders themselves
  const loadActiveSession = usePomodoroStore(state => state.loadActiveSession);
  const resetPomodoroTimer = usePomodoroStore(state => state.resetTimer);
  const pomodoroSessionId = usePomodoroStore(state => state.sessionId);

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
      // Only load active session if the timer is NOT running locally to avoid race conditions
      // where stale backend data overwrites the running timer
      const isRunning = usePomodoroStore.getState().isRunning;
      if (!isRunning) {
        loadActiveSession();
      }
    }
  }, [authStore.user, loadActiveSession]);

  useEffect(() => {
    if (
      pomodoroSessionId &&
      Number.isInteger(pomodoroSessionId) &&
      pomodoroSessionId > 0 &&
      !tasksStore.currentSession
    ) {
      tasksStore.loadSession(pomodoroSessionId);
    }
  }, [pomodoroSessionId]);

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


  // Visible schedule: exclude archived tasks (centralized filter)
  const visibleSchedule = useMemo(() => {
    return (schedulerStore.currentSchedule || []).filter(
      (t: any) => !t.archived
    );
  }, [schedulerStore.currentSchedule]);
  
  const scheduleRemainingHours = useMemo(() => {
     const incomplete = visibleSchedule.filter((t: any) => !t.completed);
     if (incomplete.length === 0) return 0;
     const totalMin = incomplete.reduce((acc: number, task: any) => acc + task.estimated_completion_time, 0);
     return Math.floor(totalMin / 60);
  }, [visibleSchedule]);

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
    setSessionSettings(pomodoroSettings);
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
    updatePomodoroSettings(sessionSettings);
    setIsSessionSettingsOpen(false);
    toast.success("Session settings saved");
  };

  return (
    <main className="flex flex-col pb-4 sm:pb-6 gap-4 sm:gap-6 p-3 sm:p-6 bg-gradient-to-br from-background via-background to-muted/30 min-h-screen rounded-xl">
      <div className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 backdrop-blur-sm bg-card/60 rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
        <SidebarTrigger />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 w-full sm:w-auto">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {visibleSchedule.filter((t: any) => !t.completed).length > 0
                ? `${scheduleRemainingHours} hours remaining`
                : "No schedule"}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {sessionInfo && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSessionDialogOpen(true)}
                className="rounded-full text-xs sm:text-sm px-3 sm:px-4"
              >
                <span className="hidden sm:inline">Session Details</span>
                <span className="sm:hidden">Details</span>
              </Button>
            )}

            <Dialog
              open={isNewSessionDialogOpen}
              onOpenChange={(open) => setIsNewSessionDialogOpen(open)}
            >
              <DialogTrigger asChild disabled={isGenerating}>
                <Button
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 rounded-full px-3 sm:px-6 text-xs sm:text-sm"
                  disabled={isGenerating}
                >
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>{isGenerating ? "Generating..." : "New Session"}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl mx-4 sm:mx-0">
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
        <DialogContent className="max-w-md w-[95vw] sm:w-full mx-4 sm:mx-0 p-4 sm:p-6">
          <DialogHeader className="space-y-2 sm:space-y-3">
            <DialogTitle className="text-lg sm:text-xl">Session Settings</DialogTitle>
            <CardDescription className="text-sm sm:text-base">
              Customize the timing for your Pomodoro session
            </CardDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="focus-duration" className="text-sm sm:text-base">Focus Duration (minutes)</Label>
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
                className="text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="short-break" className="text-sm sm:text-base">
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
                className="text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break" className="text-sm sm:text-base">Long Break Duration (minutes)</Label>
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
                className="text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break-frequency" className="text-sm sm:text-base">
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
                className="text-sm sm:text-base"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <Button
              variant="outline"
              onClick={cancelSessionSettings}
              className="flex-1 text-sm sm:text-base py-2 sm:py-3"
            >
              Cancel
            </Button>
            <Button onClick={saveSessionSettings} className="flex-1 text-sm sm:text-base py-2 sm:py-3">
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col xl:flex-row gap-4 sm:gap-8 w-full items-stretch h-full">
        <Card className="flex-1 max-h-fit" ref={pomodoroWidgetRef}>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col items-center">
              <span className="font-bold text-center mb-1">Current Task</span>
              <span className="font-normal text-center text-sm sm:text-base">
                {(() => {
                  const t = schedulerStore.getCurrentTask();
                  return t
                    ? t.name?.trim() || "Untitled Task"
                    : "No active task";
                })()}
              </span>
            </div>
            
            {/* ISOLATED TIMER DISPLAY */}
            <TimerDisplay />

            {/* ISOLATED TIMER CONTROLS */}
            <TimerControls />
            
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
            className={`max-h-full p-4 sm:p-6 ${isXL ? "overflow-hidden" : ""}`}
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                Schedule
              </h2>
              <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => schedulerStore.clearSchedule()}
                  disabled={
                    !schedulerStore.currentSchedule ||
                    schedulerStore.currentSchedule.length === 0
                  }
                  className="rounded-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all duration-300 text-xs sm:text-sm flex-1 sm:flex-none"
                >
                  <Trash2 className="size-3 sm:size-4 mr-1 sm:mr-2" />
                  Clear
                </Button>
                <ScheduleGeneratorDialog
                  onScheduleGenerated={async () => {
                    try {
                      await resetPomodoroTimer();
                    } catch (error) {
                      console.error("Failed to reset timer after schedule generation", error);
                    }
                    tasksStore.loadSessions();
                  }}
                />
              </div>
            </div>
            <ScrollArea className={cn(["p-2 sm:p-3 w-full", isXL && "h-full pb-16"])}>
              <ScheduledTasksList
                sessionSettings={pomodoroSettings}
                onOpenSettings={openSessionSettings}
              />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 sm:gap-6 w-full mt-3 sm:mt-4">
        <Card className="flex-1 backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl">
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 text-foreground flex items-center gap-2">
              Quick Checklist
            </h3>
            <div className="flex flex-col gap-2 sm:gap-3">
              {visibleSchedule.length > 0 ? (
                visibleSchedule.slice(0, 5).map((task: any, index: number) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-all duration-200 group cursor-pointer"
                    onClick={() => {
                      if (task.completed) {
                        schedulerStore.uncompleteScheduledTask(task.id);
                      } else {
                        if (
                          pomodoroPhase === 'short_break' ||
                          pomodoroPhase === 'long_break'
                        ) {
                          toast.info('Cannot complete tasks during a break.');
                          return;
                        }
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
                          if (
                            pomodoroPhase === 'short_break' ||
                            pomodoroPhase === 'long_break'
                          ) {
                            toast.info('Cannot complete tasks during a break.');
                            return;
                          }
                          schedulerStore.completeScheduledTask(task.id);
                        }
                      }}
                      className="rounded-md"
                    />
                    <span
                      className={`flex-1 transition-all duration-200 text-sm sm:text-base ${
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
                <div className="text-center text-muted-foreground py-2 text-sm sm:text-base">
                  No tasks in schedule
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
