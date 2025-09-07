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
    onSessionChange({
      ...sessionInfo,
      pomodoroSetup: pomodoroForm,
    });
    setEditingPomodoroConfig(false);
    toast.success("Pomodoro configuration updated!");
  };

  const addTask = () => {
    if (!sessionInfo || !taskForm.name.trim()) return;

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
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Session Editor</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRefinementDialog(true)}
                disabled={isRefining || isGenerating}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isRefining ? "Refining..." : "Refine with AI"}
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            Edit your session details, pomodoro configuration, and tasks before
            creating the session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Session Details Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Session Details</span>
                {!editingSessionDetails ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSessionDetails(true)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={saveSessionDetails}>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Pomodoro Configuration</span>
                {!editingPomodoroConfig ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingPomodoroConfig(true)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={savePomodoroConfig}>
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
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editingPomodoroConfig ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="focus-duration">Focus Duration (minutes)</Label>
                    <Input
                      id="focus-duration"
                      type="number"
                      min="1"
                      max="120"
                      value={pomodoroForm.duration}
                      onChange={(e) =>
                        setPomodoroForm({
                          ...pomodoroForm,
                          duration: parseInt(e.target.value) || 25,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="short-break">Short Break (minutes)</Label>
                    <Input
                      id="short-break"
                      type="number"
                      min="1"
                      max="30"
                      value={pomodoroForm.shortBreakTime}
                      onChange={(e) =>
                        setPomodoroForm({
                          ...pomodoroForm,
                          shortBreakTime: parseInt(e.target.value) || 5,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="long-break">Long Break (minutes)</Label>
                    <Input
                      id="long-break"
                      type="number"
                      min="1"
                      max="60"
                      value={pomodoroForm.longBreakTime}
                      onChange={(e) =>
                        setPomodoroForm({
                          ...pomodoroForm,
                          longBreakTime: parseInt(e.target.value) || 15,
                        })
                      }
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
                      value={pomodoroForm.pomodorosBeforeLongBreak}
                      onChange={(e) =>
                        setPomodoroForm({
                          ...pomodoroForm,
                          pomodorosBeforeLongBreak: parseInt(e.target.value) || 4,
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Focus Duration:</span>
                  <span>{sessionInfo.pomodoroSetup.duration} min</span>
                  <span className="text-muted-foreground">Short Break:</span>
                  <span>{sessionInfo.pomodoroSetup.shortBreakTime} min</span>
                  <span className="text-muted-foreground">Long Break:</span>
                  <span>{sessionInfo.pomodoroSetup.longBreakTime} min</span>
                  <span className="text-muted-foreground">Long Break After:</span>
                  <span>{sessionInfo.pomodoroSetup.pomodorosBeforeLongBreak} pomodoros</span>
                  <span className="text-muted-foreground">Total Pomodoros:</span>
                  <span>{totalPomodoros} pomodoros</span>
                  <span className="text-muted-foreground">Total Time:</span>
                  <span>{formatMinutes(totalTimeMinutes)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Tasks ({sessionInfo.tasks.length})</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetForms();
                    setAddingNewTask(true);
                  }}
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
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                      {sessionInfo.tasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                            <Card
                              key={task.id}
                              className={`border ${snapshot.isDragging ? "shadow-lg" : ""}`}
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                            >
                              <CardContent className="p-4">
                                {editingTaskId === task.id ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor="task-name">Task Name</Label>
                                        <Input
                                          id="task-name"
                                          value={taskForm.name}
                                          onChange={(e) =>
                                            setTaskForm({ ...taskForm, name: e.target.value })
                                          }
                                          placeholder="Enter task name"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="task-category">Category</Label>
                                        <Input
                                          id="task-category"
                                          value={taskForm.category}
                                          onChange={(e) =>
                                            setTaskForm({ ...taskForm, category: e.target.value })
                                          }
                                          placeholder="Enter category"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <Label htmlFor="task-description">Description</Label>
                                      <Textarea
                                        id="task-description"
                                        value={taskForm.description}
                                        onChange={(e) =>
                                          setTaskForm({
                                            ...taskForm,
                                            description: e.target.value,
                                          })
                                        }
                                        placeholder="Enter task description"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="w-48">
                                      <Label htmlFor="task-estimated-time">Estimated Time (minutes)</Label>
                                      <Input
                                        id="task-estimated-time"
                                        type="number"
                                        min="5"
                                        max="480"
                                        value={taskForm.estimatedTime}
                                        onChange={(e) =>
                                          setTaskForm({
                                            ...taskForm,
                                            estimatedTime: parseInt(e.target.value) || 25,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={saveTask}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setEditingTaskId(null);
                                          setTaskForm({
                                            name: "",
                                            description: "",
                                            category: "",
                                            estimatedTime: 25,
                                          });
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                      <div {...provided.dragHandleProps}>
                                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <h4 className="font-medium">{task.name}</h4>
                                          <Badge variant="secondary">{task.category}</Badge>
                                          <Badge variant="outline">
                                            {formatMinutes(task.estimatedTime)}
                                          </Badge>
                                        </div>
                                        {task.description && (
                                          <p className="text-sm text-muted-foreground">
                                            {task.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => editTask(task.id)}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => deleteTask(task.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      
                      {/* Add New Task Form */}
                      {addingNewTask && (
                        <Card className="border-dashed">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor="new-task-name">Task Name</Label>
                                  <Input
                                    id="new-task-name"
                                    value={taskForm.name}
                                    onChange={(e) =>
                                      setTaskForm({ ...taskForm, name: e.target.value })
                                    }
                                    placeholder="Enter task name"
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
                                  />
                                </div>
                              </div>
                              <div>
                                <Label htmlFor="new-task-description">Description</Label>
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
                                />
                              </div>
                              <div className="w-48">
                                <Label htmlFor="new-task-estimated-time">Estimated Time (minutes)</Label>
                                <Input
                                  id="new-task-estimated-time"
                                  type="number"
                                  min="5"
                                  max="480"
                                  value={taskForm.estimatedTime}
                                  onChange={(e) =>
                                    setTaskForm({
                                      ...taskForm,
                                      estimatedTime: parseInt(e.target.value) || 25,
                                    })
                                  }
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={addTask}>
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Task
                                </Button>
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
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {sessionInfo.tasks.length === 0 && !addingNewTask && (
                        <div className="text-center py-8 text-muted-foreground">
                          No tasks yet. Click "Add Task" to get started.
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
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onCreateSession}
            disabled={!sessionInfo || isGenerating || sessionInfo.tasks.length === 0}
            className="flex-1"
          >
            Create Session
          </Button>
        </div>
      </DialogContent>
      
      {/* Refinement Instructions Dialog */}
      <Dialog open={showRefinementDialog} onOpenChange={setShowRefinementDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Refine Session with AI
            </DialogTitle>
            <DialogDescription>
              Describe how you'd like the AI to improve your session. The AI will analyze your current tasks, timing, and structure to make targeted improvements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="refinement-instructions">Refinement Instructions</Label>
              <Textarea
                id="refinement-instructions"
                value={refinementInstructions}
                onChange={(e) => setRefinementInstructions(e.target.value)}
                placeholder="E.g., 'Break down larger tasks into smaller ones', 'Reorganize tasks by priority', 'Adjust timing estimates', 'Improve task descriptions', or leave empty for general improvements..."
                rows={4}
                className="mt-2"
              />
            </div>

            {sessionInfo && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                <p className="font-medium mb-2">Current session summary:</p>
                <p><strong>Title:</strong> {sessionInfo.sessionDetails.title}</p>
                <p><strong>Tasks:</strong> {sessionInfo.tasks.length} tasks ({Math.ceil(sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0) / sessionInfo.pomodoroSetup.duration)} pomodoros total)</p>
                <p><strong>Estimated time:</strong> {formatMinutes(sessionInfo.tasks.reduce((acc, task) => acc + task.estimatedTime, 0))}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowRefinementDialog(false);
                setRefinementInstructions("");
              }}
              className="flex-1"
              disabled={isRefining}
            >
              Cancel
            </Button>
            <Button
              onClick={refineWithLLM}
              disabled={isRefining || isGenerating}
              className="flex-1"
            >
              {isRefining ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
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
