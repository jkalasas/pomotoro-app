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
  Calendar,
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
      // loadActiveSession already syncs settings with the current task/session
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
      }, 100);
    };

    const handleSessionReset = () => {
      tasksStore.refreshAllData();
      // Defer analytics update
      setTimeout(() => analyticsStore.updateDailyStats(), 100);
    };

    const handleTaskCompleted = () => {
      // Session/task data refresh is already triggered by the stores.
      // Only update analytics here to avoid duplicate network calls.
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
    return (schedulerStore.currentSchedule || []).filter((t: any) => !t.archived);
  }, [schedulerStore.currentSchedule]);

  // Generate session from plain text project details using recommendations API
  const startGenerating = async (projectDetails: string) => {
    try {
      setIsGenerating(true);
      toast.info("Generating session recommendations...");
      const resp = (await apiClient.getRecommendations(projectDetails)) as RecommendationResponse;

      const generated: GeneratedSessionInfo = {
        sessionDetails: {
          title: resp.session?.name || "Generated Session",
          description: resp.session?.description || "",
        },
        pomodoroSetup: {
          duration: resp.pomodoro_config?.focus_duration || 25,
          shortBreakTime: resp.pomodoro_config?.short_break_duration || 5,
          longBreakTime: resp.pomodoro_config?.long_break_duration || 15,
          pomodorosBeforeLongBreak: resp.pomodoro_config?.long_break_per_pomodoros || 4,
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
          long_break_per_pomodoros: sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak,
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
    const { focus_duration, short_break_duration, long_break_duration, long_break_per_pomodoros } = sessionSettings;
    if (!focus_duration || !short_break_duration || !long_break_duration || !long_break_per_pomodoros) {
      toast.error("Please fill all session settings with values greater than 0");
      return;
    }
    pomodoroStore.updateSettings(sessionSettings);
    setIsSessionSettingsOpen(false);
    toast.success("Session settings saved");
  };

  return (
    <main className="flex flex-col pb-8 gap-8 p-8 min-h-screen">
      <div className="w-full flex justify-between items-center backdrop-blur-md bg-card/70 rounded-xl p-4 border border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              My Tasks
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-3 py-2 rounded-lg backdrop-blur-sm border border-border/30">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {visibleSchedule.filter((t) => !t.completed).length > 0
                ? `${Math.floor(
                    visibleSchedule
                      .filter((task) => !task.completed)
                      .reduce((acc, task) => acc + task.estimated_completion_time, 0) / 60
                  )} hours remaining`
                : "No schedule"}
            </span>
          </div>
          {sessionInfo && (
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsSessionDialogOpen(true)} 
              className="rounded-lg hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-md hover:shadow-primary/20 transition-all duration-300"
            >
              Session Details
            </Button>
          )}

          <Dialog open={isNewSessionDialogOpen} onOpenChange={(open) => setIsNewSessionDialogOpen(open)}>
            <DialogTrigger disabled={isGenerating}>
              <Button 
                className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300 rounded-full px-6 py-2 text-sm font-medium" 
                disabled={isGenerating}
              >
                <Plus className="h-4 w-4" />
                <span>{isGenerating ? "Generating..." : "New Session"}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl border-border/40 bg-card/90 backdrop-blur-md">
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

      <Dialog open={isSessionSettingsOpen} onOpenChange={(open) => setIsSessionSettingsOpen(open)}>
        <DialogContent className="max-w-md rounded-xl border-border/40 bg-card/90 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Session Settings</DialogTitle>
            <CardDescription className="text-sm">Customize the timing for your Pomodoro session</CardDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="focus-duration" className="text-sm font-medium">Focus Duration (minutes)</Label>
              <Input
                id="focus-duration"
                type="number"
                min="1"
                max="120"
                value={sessionSettings.focus_duration === 0 ? "" : sessionSettings.focus_duration}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    focus_duration: Number.isNaN(v) ? 0 : v,
                  });
                }}
                className="rounded-lg border-border/40 bg-card/50 backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="short-break" className="text-sm font-medium">Short Break Duration (minutes)</Label>
              <Input
                id="short-break"
                type="number"
                min="1"
                max="30"
                value={sessionSettings.short_break_duration === 0 ? "" : sessionSettings.short_break_duration}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    short_break_duration: Number.isNaN(v) ? 0 : v,
                  });
                }}
                className="rounded-lg border-border/40 bg-card/50 backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break" className="text-sm font-medium">Long Break Duration (minutes)</Label>
              <Input
                id="long-break"
                type="number"
                min="1"
                max="60"
                value={sessionSettings.long_break_duration === 0 ? "" : sessionSettings.long_break_duration}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    long_break_duration: Number.isNaN(v) ? 0 : v,
                  });
                }}
                className="rounded-lg border-border/40 bg-card/50 backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="long-break-frequency" className="text-sm font-medium">Long Break After (pomodoros)</Label>
              <Input
                id="long-break-frequency"
                type="number"
                min="1"
                max="10"
                value={sessionSettings.long_break_per_pomodoros === 0 ? "" : sessionSettings.long_break_per_pomodoros}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSessionSettings({
                    ...sessionSettings,
                    long_break_per_pomodoros: Number.isNaN(v) ? 0 : v,
                  });
                }}
                className="rounded-lg border-border/40 bg-card/50 backdrop-blur-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <Button 
              variant="outline" 
              onClick={cancelSessionSettings} 
              className="flex-1 rounded-lg border-border/40 hover:bg-muted/20 transition-all duration-300"
            >
              Cancel
            </Button>
            <Button 
              onClick={saveSessionSettings} 
              className="flex-1 rounded-lg bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-md hover:shadow-lg transition-all duration-300"
            >
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col xl:flex-row gap-4 w-full items-stretch h-full">
        <Card className="flex-1 max-h-fit backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 rounded-xl overflow-hidden" ref={pomodoroWidgetRef}>
          <CardContent className="px-6 py-2">
            <div className="flex flex-col items-center mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Clock className="h-3 w-3 text-primary" />
                </div>
                <span className="font-bold text-lg text-center bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Current Task</span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-muted/30 to-muted/20 border border-border/30 backdrop-blur-sm">
                <span className="font-medium text-center text-foreground text-sm">{(() => { const t = schedulerStore.getCurrentTask(); return t ? (t.name?.trim() || "Untitled Task") : "No active task"; })()}</span>
              </div>
            </div>
            <div className="mx-auto mb-6">
              <PomodoroTimer 
                time={schedulerStore.getCurrentTask() ? pomodoroStore.time : 0} 
                endTime={pomodoroStore.maxTime} 
              />
            </div>
            <div className="mb-6 flex flex-col items-center">
              {schedulerStore.getCurrentTask() ? (
                <>
                  <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/20 mb-2">
                    <p className="text-center font-medium text-primary text-sm">
                      {pomodoroStore.phase === "focus" ? "Stay focused!" : pomodoroStore.phase === "short_break" ? "Short break" : "Long break"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{Math.floor(pomodoroStore.time / 60)} minutes remaining</p>
                </>
              ) : null}
            </div>

            {pomodoroStore.showRestOverlay && (
              <div className="flex items-center justify-center mb-4 p-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-500/10 border border-amber-500/20">
                <p className="text-center text-xs text-amber-600 font-medium">Rest Overlay Active</p>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3">
              {schedulerStore.getCurrentTask() && (
                <>
                  <div className="flex gap-3">
                    <Button 
                      className="flex flex-1 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 text-sm" 
                      variant="default" 
                      onClick={async () => { 
                        try {
                          if (pomodoroStore.isRunning) { 
                            await pomodoroStore.pauseTimer(); 
                          } else { 
                            await pomodoroStore.startTimer(); 
                          }
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to start timer");
                        }
                      }} 
                      disabled={pomodoroStore.isLoading}
                    >
                      {pomodoroStore.isRunning ? (<><Pause className="h-4 w-4" /><span>Pause Task</span></>) : (<><Play className="h-4 w-4" /><span>Start Task</span></>)}
                    </Button>
                    <Button 
                      className="flex items-center gap-2 rounded-xl border-border/40 hover:bg-muted/20 hover:shadow-md transition-all duration-300" 
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
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
              {schedulerStore.getCurrentTask() && (
                <Button 
                  className="flex items-center gap-2 rounded-xl border-border/40 hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-md hover:shadow-primary/20 transition-all duration-300 text-sm" 
                  variant="outline" 
                  onClick={() => { 
                    const currentTask = schedulerStore.getCurrentTask(); 
                    if (currentTask) { 
                      schedulerStore.completeScheduledTask(currentTask.id); 
                    } 
                  }}
                >
                  <Check className="h-4 w-4" />
                  <span>Mark Task Complete</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex-2 backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 rounded-xl overflow-hidden" style={{ maxHeight: pomodoroWidgetSize.height ? `${pomodoroWidgetSize.height}px` : "auto" }}>
          <CardContent className="max-h-full overflow-hidden px-6 py-2">
            <div className="flex justify-between items-center mb-6 ">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Calendar className="h-3 w-3 text-primary" />
                </div>
                <h2 className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Schedule</h2>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => schedulerStore.clearSchedule()} 
                  disabled={!schedulerStore.currentSchedule || schedulerStore.currentSchedule.length === 0} 
                  className="rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 hover:shadow-md hover:shadow-destructive/20 transition-all duration-300 border-border/40 text-xs"
                >
                  <Trash2 className="size-3 mr-1" />
                  Clear
                </Button>
                <ScheduleGeneratorDialog onScheduleGenerated={() => {}} />
              </div>
            </div>
            <div className="max-h-full overflow-y-auto pb-2 custom-scrollbar">
              <ScheduledTasksList sessionSettings={pomodoroStore.settings} onOpenSettings={openSessionSettings} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 w-full">
        <Card className="flex-1 backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 rounded-xl overflow-hidden">
          <CardContent className="px-6 py-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <Check className="h-3 w-3 text-primary" />
              </div>
              <h3 className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Quick Checklist</h3>
            </div>
            <div className="flex flex-col gap-3">
              {visibleSchedule.length > 0 ? (
                visibleSchedule.slice(0, 5).map((task: any, index: number) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-muted/20 to-muted/10 hover:from-muted/30 hover:to-muted/20 transition-all duration-300 group border border-border/20 hover:border-border/40 hover:shadow-md">
                    <Checkbox 
                      checked={task.completed || false} 
                      onCheckedChange={() => { 
                        if (task.completed) { 
                          schedulerStore.uncompleteScheduledTask(task.id); 
                        } else { 
                          schedulerStore.completeScheduledTask(task.id); 
                        } 
                      }} 
                      className="rounded-md border-border/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary" 
                    />
                    <span className={`flex-1 transition-all duration-200 font-medium text-sm ${task.completed ? "line-through text-muted-foreground" : "group-hover:text-primary"}`}>
                      {task.name?.trim() || "Untitled Task"}
                    </span>
                    <div className="text-xs text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-2 py-1 rounded-md font-medium">
                      #{index + 1}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-muted/30 to-muted/20 flex items-center justify-center shadow-md">
                    <PlusCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h4 className="font-bold text-base mb-2">No tasks yet</h4>
                  <p className="text-xs leading-relaxed">Generate a schedule to see tasks here</p>
                </div>
              )}
              {visibleSchedule.length > 5 && (
                <div className="text-xs text-muted-foreground mt-2 px-2 py-1 rounded-lg bg-gradient-to-r from-muted/20 to-muted/10 border border-border/20 text-center font-medium">
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
