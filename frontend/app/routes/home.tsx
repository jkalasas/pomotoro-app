import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
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
import { TaskForm } from "~/components/pomotoro/forms/TaskForm";
import { PomodoroTimer } from "~/components/pomotoro/charts/pomodoro-timer";
import { Button } from "~/components/ui/button";
import {
  Check,
  CloudLightning,
  FilePenLine,
  Pause,
  Play,
  Plus,
  PlusCircle,
} from "lucide-react";
import { DailyGoalChart } from "~/components/pomotoro/charts/daily-goal-chart";
import { Checkbox } from "~/components/ui/checkbox";
import TaskCheckItem from "~/components/pomotoro/tasks/task-check-item";
import { generateTasks, refineSessionPrompt } from "~/lib/ai";
import { TaskScheduler } from "~/components/pomotoro/tasks/task-scheduler";
import { SessionInfoForm } from "~/components/pomotoro/forms/SessionInfoForm";
import type { Session } from "~/types/session";
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

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pomotoro" },
    { name: "description", content: "Welcome to pomotoro!" },
  ];
}

const tasks = ["Refactor date function", "Debugging"];

export default function Home() {
  const tasksStore = useTaskStore();
  const pomodoroStore = usePomodoroStore();

  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<Session>();

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

    const toastId = toast.loading("Refining user request...", {
      duration: Infinity,
    });

    try {
      const refinedPrompt = await refineSessionPrompt(projectDetails);

      toast.loading("Generating tasks...", {
        id: toastId,
        duration: Infinity,
      });
      const result = await generateTasks(refinedPrompt);
      setSessionInfo(result);

      toast.success("Tasks generated successfully!", {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      toast.error("Failed to generate tasks", {
        id: toastId,
        duration: 5000,
      });
    }
    setIsGenerating(false);
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
        </DialogContent>
      </Dialog>
      <div className="flex justify-between w-full">
        <span className="font-bold">Coding Session</span>
        <span className="font-medium">2 hours allotted</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 w-full gap-5">
        <Card className="row-span-3">
          <CardContent>
            <div className="flex flex-col items-center">
              <span className="font-bold text-center">Current Task</span>
              <span className="font-thin text-center">Debugging</span>
            </div>
            <div className="mx-aut">
              <PomodoroTimer
                time={pomodoroStore.time}
                endTime={pomodoroStore.maxTime}
              />
            </div>
            <p className="text-center">Stay Focus for 10 minutes</p>

            <div className="mt-3 flex flex-col gap-3">
              <Button
                className="flex items-center gap-3"
                variant="ghost"
                onClick={() => {
                  pomodoroStore.startTimer();
                }}
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
              <Button className="flex items-center gap-3">
                <CloudLightning />
                <span>Extend Task</span>
              </Button>
              <Button className="flex items-center gap-3">
                <Check />
                <span>Finish Task</span>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="row-span-2 col-span-2">
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="font-bold">Daily Progress</span>
              <Button variant="ghost">
                <FilePenLine className="size-6" />
              </Button>
            </div>
            <div className="flex justify-between items-center px-5 flex-col lg:flex-row gap-3">
              <div className="flex flex-col items-center justify-center">
                <span>Rests</span>
                <span className="text-2xl font-bold">50</span>
                <span>Minutes</span>
              </div>
              <DailyGoalChart sessions={1} targetSessions={1} />
              <div className="flex flex-col items-center justify-center">
                <span>Finished</span>
                <span className="text-2xl font-bold">8</span>
                <span>Tasks</span>
              </div>
            </div>
            <p className="text-center">Completed: 2 sessions</p>
          </CardContent>
        </Card>
        <Card className="row-span-3 col-span-2">
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="font-bold">Tasks</span>
              <Button>
                <PlusCircle />
                Add New Task
              </Button>
            </div>
            <div className="h-96">
              <TaskScheduler />
            </div>
          </CardContent>
        </Card>
        <Card className="place-self-stretch">
          <CardContent>
            <p className="font-bold">Checklist</p>
            <div className="flex flex-col gap-1">
              {tasks.map((task, index) => (
                <TaskCheckItem task={task} key={index} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
