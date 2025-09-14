import { useState, useEffect, useMemo } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Edit,
  Plus,
  Trash2,
  Save,
  X,
  Sparkles,
  Settings,
  GripVertical,
  ClipboardList,
} from "lucide-react";
import { TaskDifficulty } from "~/types/task";
import { formatMinutes } from "~/lib/time";
import { toast } from "sonner";
import { apiClient } from "~/lib/api";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";

export interface GeneratedSessionInfo {
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
    estimatedTime: number; // in minutes
    category: string;
  }>;
}

interface SessionEditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessionInfo: GeneratedSessionInfo | null;
  onSessionChange: (sessionInfo: GeneratedSessionInfo) => void;
  onCreateSession: () => void;
  isGenerating: boolean;
}

interface TaskFormData {
  name: string;
  description: string;
  category: string;
  estimatedTime: number; // in minutes
}

export function SessionEditorDialog({
  isOpen,
  onOpenChange,
  sessionInfo,
  onSessionChange,
  onCreateSession,
  isGenerating,
}: SessionEditorDialogProps) {
  const [editingSessionDetails, setEditingSessionDetails] = useState(false);
  const [editingPomodoroConfig, setEditingPomodoroConfig] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [addingNewTask, setAddingNewTask] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [showRefinementDialog, setShowRefinementDialog] = useState(false);
  const [refinementInstructions, setRefinementInstructions] = useState("");

  // Form states
  const [sessionForm, setSessionForm] = useState({
    title: "",
    description: "",
  });

  const [pomodoroForm, setPomodoroForm] = useState({
    duration: 25,
    shortBreakTime: 5,
    longBreakTime: 15,
    pomodorosBeforeLongBreak: 4,
  });

  const [taskForm, setTaskForm] = useState<TaskFormData>({
    name: "",
    description: "",
    category: "",
    estimatedTime: 25,
  });

  // Update forms when sessionInfo changes
  useEffect(() => {
    if (sessionInfo) {
      setSessionForm({
        title: sessionInfo.sessionDetails.title,
        description: sessionInfo.sessionDetails.description,
      });
      setPomodoroForm(sessionInfo.pomodoroSetup);
    }
  }, [sessionInfo]);

  const totalPomodoros = useMemo(() => {
    if (!sessionInfo) return 0;
    return Math.ceil(sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0) / sessionInfo.pomodoroSetup.duration);
  }, [sessionInfo]);

  const totalTimeMinutes = useMemo(() => {
    if (!sessionInfo) return 0;
    return sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0);
  }, [sessionInfo]);

  const saveSessionDetails = () => {
    if (!sessionInfo) return;
    onSessionChange({
      ...sessionInfo,
      sessionDetails: sessionForm,
    });
    setEditingSessionDetails(false);
    toast.success("Session details updated!");
  };

  const savePomodoroConfig = () => {
    if (!sessionInfo) return;
    const { duration, shortBreakTime, longBreakTime, pomodorosBeforeLongBreak } = pomodoroForm;
    if (!duration || !shortBreakTime || !longBreakTime || !pomodorosBeforeLongBreak) {
      toast.error("Please fill all Pomodoro settings with values greater than 0");
      return;
    }
    onSessionChange({
      ...sessionInfo,
      pomodoroSetup: pomodoroForm,
    });
    setEditingPomodoroConfig(false);
    toast.success("Pomodoro configuration updated!");
  };

  const addTask = () => {
    if (!sessionInfo || !taskForm.name.trim()) {
      toast.error("Task name can't be empty");
      return;
    }
    if (!taskForm.estimatedTime || taskForm.estimatedTime <= 0) {
      toast.error("Estimated time must be greater than 0");
      return;
    }

    const newTask = {
      id: `temp-${Date.now()}`,
      name: taskForm.name,
      description: taskForm.description,
      difficulty: TaskDifficulty.MEDIUM,
      estimatedTime: taskForm.estimatedTime,
      category: taskForm.category,
    };

    onSessionChange({
      ...sessionInfo,
      tasks: [...sessionInfo.tasks, newTask],
    });

    setTaskForm({
      name: "",
      description: "",
      category: "",
      estimatedTime: 25,
    });
    setAddingNewTask(false);
    toast.success("Task added!");
  };

  const editTask = (taskId: string) => {
    const task = sessionInfo?.tasks.find((t) => t.id === taskId);
    if (!task) return;

    setTaskForm({
      name: task.name,
      description: task.description,
      category: task.category,
      estimatedTime: task.estimatedTime,
    });
    setEditingTaskId(taskId);
  };

  const saveTask = () => {
    if (!sessionInfo || !editingTaskId) return;
    if (!taskForm.name.trim()) {
      toast.error("Task name can't be empty");
      return;
    }
    if (!taskForm.estimatedTime || taskForm.estimatedTime <= 0) {
      toast.error("Estimated time must be greater than 0");
      return;
    }

    const updatedTasks = sessionInfo.tasks.map((task) =>
      task.id === editingTaskId
        ? {
            ...task,
            name: taskForm.name,
            description: taskForm.description,
            category: taskForm.category,
            estimatedTime: taskForm.estimatedTime,
          }
        : task
    );

    onSessionChange({
      ...sessionInfo,
      tasks: updatedTasks,
    });

    setEditingTaskId(null);
    setTaskForm({
      name: "",
      description: "",
      category: "",
      estimatedTime: 25,
    });
    toast.success("Task updated!");
  };

  const deleteTask = (taskId: string) => {
    if (!sessionInfo) return;

    const updatedTasks = sessionInfo.tasks.filter((task) => task.id !== taskId);
    onSessionChange({
      ...sessionInfo,
      tasks: updatedTasks,
    });
    toast.success("Task deleted!");
  };

  const refineWithLLM = async () => {
    if (!sessionInfo || isRefining) return;

    setIsRefining(true);
    const toastId = toast.loading("Refining session with AI...", {
      duration: Infinity,
    });

    try {
      // Create a context description for the LLM including current session state and user instructions
      const currentContext = `
Current session: ${sessionInfo.sessionDetails.title}
Description: ${sessionInfo.sessionDetails.description}

Current tasks:
${sessionInfo.tasks
  .map(
    (task, index) =>
      `${index + 1}. ${task.name} (${task.category}, ${task.estimatedTime} minutes)`
  )
  .join("\n")}

Current pomodoro setup:
- Focus duration: ${sessionInfo.pomodoroSetup.duration} minutes
- Short break: ${sessionInfo.pomodoroSetup.shortBreakTime} minutes
- Long break: ${sessionInfo.pomodoroSetup.longBreakTime} minutes
- Long break after: ${sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak} pomodoros

User refinement instructions: ${refinementInstructions || "Please refine and improve this session, keeping the general structure but optimizing the task breakdown, timing, and categorization."}
      `.trim();

      // Use the refine API instead of regenerate
      const refinedData = await apiClient.refineSession(currentContext) as {
        session: { name: string; description: string };
        generated_tasks: Array<{ name: string; category: string; estimated_completion_time: number }>;
        pomodoro_config: {
          focus_duration: number;
          short_break_duration: number;
          long_break_duration: number;
          long_break_per_pomodoros: number;
        };
      };

      // Convert backend response to frontend format
      const refinedSession = {
        sessionDetails: {
          title: refinedData.session.name,
          description: refinedData.session.description,
        },
        pomodoroSetup: {
          duration: refinedData.pomodoro_config.focus_duration,
          shortBreakTime: refinedData.pomodoro_config.short_break_duration,
          longBreakTime: refinedData.pomodoro_config.long_break_duration,
          pomodorosBeforeLongBreak: refinedData.pomodoro_config.long_break_per_pomodoros,
        },
        tasks: refinedData.generated_tasks.map((task, index: number) => ({
          id: `temp-${Date.now()}-${index}`,
          name: task.name,
          description: "",
          difficulty: TaskDifficulty.MEDIUM,
          estimatedTime: task.estimated_completion_time,
          category: task.category,
        })),
      };

      onSessionChange(refinedSession);
      setShowRefinementDialog(false);
      setRefinementInstructions("");

      toast.success("Session refined successfully!", {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      toast.error("Failed to refine session", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setIsRefining(false);
    }
  };

  const resetForms = () => {
    setEditingSessionDetails(false);
    setEditingPomodoroConfig(false);
    setEditingTaskId(null);
    setAddingNewTask(false);
    setTaskForm({
      name: "",
      description: "",
      category: "",
      estimatedTime: 25,
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !sessionInfo) return;

    const tasks = Array.from(sessionInfo.tasks);
    const [reorderedTask] = tasks.splice(result.source.index, 1);
    tasks.splice(result.destination.index, 0, reorderedTask);

    onSessionChange({
      ...sessionInfo,
      tasks,
    });
  };

  if (!sessionInfo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl w-[95vw] overflow-y-auto bg-card border-border/50 shadow-lg rounded-2xl sm:w-full p-4 sm:p-6">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <DialogTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between items-center gap-3">
            <span className="text-lg sm:text-xl">Session Editor</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRefinementDialog(true)}
                disabled={isRefining || isGenerating}
                className="rounded-full text-xs sm:text-sm px-3 sm:px-4"
              >
                <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{isRefining ? "Refining..." : "Refine with AI"}</span>
                <span className="sm:hidden">{isRefining ? "..." : "AI"}</span>
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            Edit your session details, pomodoro configuration, and tasks before
            creating the session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 ">
          {/* Session Details Section */}
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Session Details</span>
                {!editingSessionDetails ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSessionDetails(true)}
                    className="rounded-full"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={saveSessionDetails} className="rounded-full">
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingSessionDetails(false);
                        setSessionForm({
                          title: sessionInfo.sessionDetails.title,
                          description: sessionInfo.sessionDetails.description,
                        });
                      }}
                      className="rounded-full"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editingSessionDetails ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="session-title">Title</Label>
                    <Input
                      id="session-title"
                      value={sessionForm.title}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, title: e.target.value })
                      }
                      placeholder="Enter session title"
                      className="rounded-lg"
                    />
                  </div>
                  <div>
                    <Label htmlFor="session-description">Description</Label>
                    <Textarea
                      id="session-description"
                      value={sessionForm.description}
                      onChange={(e) =>
                        setSessionForm({
                          ...sessionForm,
                          description: e.target.value,
                        })
                      }
                      placeholder="Enter session description"
                      rows={3}
                      className="rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="font-medium text-lg">{sessionInfo.sessionDetails.title}</h3>
                  <p className="text-muted-foreground mt-1">
                    {sessionInfo.sessionDetails.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pomodoro Configuration Section */}
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Pomodoro Configuration</span>
                {!editingPomodoroConfig ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingPomodoroConfig(true)}
                    className="rounded-full"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={savePomodoroConfig} className="rounded-full">
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingPomodoroConfig(false);
                        setPomodoroForm(sessionInfo.pomodoroSetup);
                      }}
                      className="rounded-full"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editingPomodoroConfig ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="focus-duration">Focus Duration (minutes)</Label>
                    <Input
                      id="focus-duration"
                      type="number"
                      min="1"
                      max="120"
                      value={pomodoroForm.duration === 0 ? "" : pomodoroForm.duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setPomodoroForm({
                          ...pomodoroForm,
                          duration: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                      className="rounded-lg"
                    />
                  </div>
                  <div>
                    <Label htmlFor="short-break">Short Break (minutes)</Label>
                    <Input
                      id="short-break"
                      type="number"
                      min="1"
                      max="30"
                      value={pomodoroForm.shortBreakTime === 0 ? "" : pomodoroForm.shortBreakTime}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setPomodoroForm({
                          ...pomodoroForm,
                          shortBreakTime: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                      className="rounded-lg"
                    />
                  </div>
                  <div>
                    <Label htmlFor="long-break">Long Break (minutes)</Label>
                    <Input
                      id="long-break"
                      type="number"
                      min="1"
                      max="60"
                      value={pomodoroForm.longBreakTime === 0 ? "" : pomodoroForm.longBreakTime}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setPomodoroForm({
                          ...pomodoroForm,
                          longBreakTime: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                      className="rounded-lg"
                    />
                  </div>
                  <div>
                    <Label htmlFor="long-break-frequency">
                      Long Break After (pomodoros)
                    </Label>
                    <Input
                      id="long-break-frequency"
                      type="number"
                      min="1"
                      max="10"
                      value={pomodoroForm.pomodorosBeforeLongBreak === 0 ? "" : pomodoroForm.pomodorosBeforeLongBreak}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setPomodoroForm({
                          ...pomodoroForm,
                          pomodorosBeforeLongBreak: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                      className="rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm p-3 bg-muted/20 rounded-lg">
                      <span className="text-muted-foreground">Focus Duration:</span>
                      <span className="font-medium">{sessionInfo.pomodoroSetup.duration} min</span>
                      <span className="text-muted-foreground">Short Break:</span>
                      <span className="font-medium">{sessionInfo.pomodoroSetup.shortBreakTime} min</span>
                      <span className="text-muted-foreground">Long Break:</span>
                      <span className="font-medium">{sessionInfo.pomodoroSetup.longBreakTime} min</span>
                      <span className="text-muted-foreground">Long Break After:</span>
                      <span className="font-medium">{sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak} pomodoros</span>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 bg-muted/20 rounded-lg">
                      <div className="flex flex-col items-center sm:items-start">
                        <span className="text-muted-foreground text-sm">Total Pomodoros</span>
                        <span className="text-xl font-semibold">{totalPomodoros}</span>
                      </div>
                      <div className="hidden sm:block h-8 border-r border-muted-foreground/30"></div>
                      <div className="flex flex-col items-center sm:items-start">
                        <span className="text-muted-foreground text-sm">Total Time</span>
                        <span className="text-xl font-semibold">{formatMinutes(totalTimeMinutes)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tasks Section */}
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Tasks ({sessionInfo.tasks.length})</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetForms();
                    setAddingNewTask(true);
                  }}
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="tasks">
                  {(provided: DroppableProvided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {sessionInfo.tasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                            <div
                              key={task.id}
                              className={`p-2 bg-muted/20 rounded-lg border border-border/40 ${snapshot.isDragging ? "shadow-lg" : ""}`}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                            >
                              <div className="p-2">
                                {editingTaskId === task.id ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor={`task-name-${task.id}`}>Task Name</Label>
                                        <Input
                                          id={`task-name-${task.id}`}
                                          value={taskForm.name}
                                          onChange={(e) =>
                                            setTaskForm({
                                              ...taskForm,
                                              name: e.target.value,
                                            })
                                          }
                                          placeholder="Task name"
                                          className="rounded-lg"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`task-category-${task.id}`}>Category</Label>
                                        <Input
                                          id={`task-category-${task.id}`}
                                          value={taskForm.category}
                                          onChange={(e) =>
                                            setTaskForm({
                                              ...taskForm,
                                              category: e.target.value,
                                            })
                                          }
                                          placeholder="Category"
                                          className="rounded-lg"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <Label htmlFor={`task-description-${task.id}`}>Description (Optional)</Label>
                                      <Textarea
                                        id={`task-description-${task.id}`}
                                        value={taskForm.description}
                                        onChange={(e) =>
                                          setTaskForm({
                                            ...taskForm,
                                            description: e.target.value,
                                          })
                                        }
                                        placeholder="Task description"
                                        rows={2}
                                        className="rounded-lg"
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`task-time-${task.id}`}>Estimated Time (minutes)</Label>
                                      <Input
                                        id={`task-time-${task.id}`}
                                        type="number"
                                        min="1"
                                        max="240"
                                        value={taskForm.estimatedTime === 0 ? "" : taskForm.estimatedTime}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          setTaskForm({
                                            ...taskForm,
                                            estimatedTime: Number.isNaN(v) ? 0 : v,
                                          });
                                        }}
                                        className="rounded-lg"
                                      />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <Button variant="outline" size="sm" onClick={() => setEditingTaskId(null)} className="rounded-full">
                                        <X className="h-4 w-4" />
                                        Cancel
                                      </Button>
                                      <Button size="sm" onClick={saveTask} className="rounded-full">
                                        <Save className="h-4 w-4 mr-2" />
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                    <div className="flex items-center gap-2" {...provided.dragHandleProps}>
                                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                                      <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-medium">{task.name}</span>
                                          {task.category && (
                                            <Badge variant="outline" className="text-xs">
                                              {task.category}
                                            </Badge>
                                          )}
                                        </div>
                                        {task.description && (
                                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                            {task.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-2 mt-2 sm:mt-0">
                                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                        {task.estimatedTime} min
                                      </Badge>
                                      <div className="flex items-center">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => editTask(task.id)}
                                          className="h-6 w-6"
                                        >
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => deleteTask(task.id)}
                                          className="h-6 w-6 text-destructive"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      
                      {/* Add New Task Form */}
                      {addingNewTask && (
                        <div className="p-3 bg-muted/20 rounded-lg border border-dashed border-border">
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="new-task-name">Task Name</Label>
                                <Input
                                  id="new-task-name"
                                  value={taskForm.name}
                                  onChange={(e) =>
                                    setTaskForm({ ...taskForm, name: e.target.value })
                                  }
                                  placeholder="Enter task name"
                                  className="rounded-lg"
                                />
                              </div>
                              <div>
                                <Label htmlFor="new-task-category">Category</Label>
                                <Input
                                  id="new-task-category"
                                  value={taskForm.category}
                                  onChange={(e) =>
                                    setTaskForm({ ...taskForm, category: e.target.value })
                                  }
                                  placeholder="Enter category"
                                  className="rounded-lg"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="new-task-description">Description (Optional)</Label>
                              <Textarea
                                id="new-task-description"
                                value={taskForm.description}
                                onChange={(e) =>
                                  setTaskForm({
                                    ...taskForm,
                                    description: e.target.value,
                                  })
                                }
                                placeholder="Enter task description"
                                rows={2}
                                className="rounded-lg"
                              />
                            </div>
                            <div>
                              <Label htmlFor="new-task-estimated-time">Estimated Time (minutes)</Label>
                              <Input
                                id="new-task-estimated-time"
                                type="number"
                                min="5"
                                max="480"
                                value={taskForm.estimatedTime === 0 ? "" : taskForm.estimatedTime}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setTaskForm({
                                    ...taskForm,
                                    estimatedTime: Number.isNaN(v) ? 0 : v,
                                  });
                                }}
                                className="rounded-lg"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAddingNewTask(false);
                                  setTaskForm({
                                    name: "",
                                    description: "",
                                    category: "",
                                    estimatedTime: 25,
                                  });
                                }}
                                className="rounded-full"
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                              <Button size="sm" onClick={addTask} className="rounded-full">
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {sessionInfo.tasks.length === 0 && !addingNewTask && (
                        <div className="flex flex-col items-center justify-center py-8 text-center p-4 bg-muted/20 rounded-lg border border-dashed border-border">
                          <div className="rounded-full bg-muted/30 p-3 mb-3">
                            <ClipboardList className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-medium mb-1">No Tasks Added</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Add tasks to your session to get started
                          </p>
                          <Button
                            onClick={() => {
                              resetForms();
                              setAddingNewTask(true);
                            }}
                            variant="outline"
                            className="rounded-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add First Task
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-full text-sm sm:text-base py-2 sm:py-3"
          >
            Cancel
          </Button>
          <Button
            onClick={onCreateSession}
            disabled={!sessionInfo || isGenerating || sessionInfo.tasks.length === 0}
            className="flex-1 rounded-full text-sm sm:text-base py-2 sm:py-3"
          >
            {isGenerating ? (
              <>
                <span className="hidden sm:inline">Creating Session...</span>
                <span className="sm:hidden">Creating...</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Create Session</span>
                <span className="sm:hidden">Create</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
      
      {/* Refinement Instructions Dialog */}
      <Dialog open={showRefinementDialog} onOpenChange={setShowRefinementDialog}>
        <DialogContent className="max-w-2xl w-[95vw] backdrop-blur-sm bg-card/80 border-border/50 shadow-lg rounded-2xl sm:w-full p-4 sm:p-6">
          <DialogHeader className="space-y-2 sm:space-y-3">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
              Refine Session with AI
            </DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Describe how you'd like the AI to improve your session. The AI will analyze your current tasks, timing, and structure to make targeted improvements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-4">
                <Label htmlFor="refinement-instructions">Refinement Instructions</Label>
                <Textarea
                  id="refinement-instructions"
                  value={refinementInstructions}
                  onChange={(e) => setRefinementInstructions(e.target.value)}
                  placeholder="E.g., 'Break down larger tasks into smaller ones', 'Reorganize tasks by priority', 'Adjust timing estimates', 'Improve task descriptions', or leave empty for general improvements..."
                  rows={4}
                  className="mt-2 rounded-lg"
                />
              </CardContent>
            </Card>

            {sessionInfo && (
              <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-sm rounded-xl overflow-hidden">
                <CardHeader className="pb-2 bg-muted/20">
                  <CardTitle className="text-sm font-medium">Current Session Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Title:</span>
                  <span className="font-medium">{sessionInfo.sessionDetails.title}</span>
                  
                  <span className="text-muted-foreground">Tasks:</span>
                  <span className="font-medium">
                    {sessionInfo.tasks.length} tasks 
                    <span className="text-xs text-muted-foreground ml-2">
                      ({Math.ceil(sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0) / sessionInfo.pomodoroSetup.duration)} pomodoros)
                    </span>
                  </span>
                  
                  <span className="text-muted-foreground">Estimated time:</span>
                  <span className="font-medium">{formatMinutes(sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0))}</span>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowRefinementDialog(false);
                setRefinementInstructions("");
              }}
              className="flex-1 rounded-full"
              disabled={isRefining}
            >
              Cancel
            </Button>
            <Button
              onClick={refineWithLLM}
              disabled={isRefining || isGenerating}
              className="flex-1 rounded-full"
            >
              {isRefining ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                  Refining...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Refine Session
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
