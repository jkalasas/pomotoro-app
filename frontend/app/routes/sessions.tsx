import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Clock,
  Target,
  Archive,
  ArchiveRestore,
  ArrowDown,
  Copy,
  Check,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { useTaskStore, type Session, type Task } from "~/stores/tasks";
import { useAnalyticsStore } from "~/stores/analytics";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

export default function Sessions() {
  const {
    sessions,
    isLoading,
    loadSessions,
    loadArchivedSessions,
    getSession,
    updateSession,
    deleteSession,
    archiveSession,
    unarchiveSession,
    addTaskToSession,
    completeTask,
    uncompleteTask,
    updateTask,
    deleteTask,
    reorderTasks,
    moveCompletedAndArchivedToBottom,
    archiveTask,
    unarchiveTask,
  } = useTaskStore();

  const analyticsStore = useAnalyticsStore();

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [archivedSessions, setArchivedSessions] = useState<Session[]>([]);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState<
    "all" | "active" | "completed" | "archived"
  >("all");

  // Form states
  const [sessionForm, setSessionForm] = useState({
    name: "",
    description: "",
    focus_duration: 25,
    short_break_duration: 5,
    long_break_duration: 15,
    long_break_per_pomodoros: 4,
  });

  const [taskForm, setTaskForm] = useState({
    name: "",
    category: "",
    estimated_completion_time: 30,
  });

  useEffect(() => {
    const fetchArchived = async () => {
      try {
        const archived = await loadArchivedSessions();
        setArchivedSessions(archived);
      } catch (e) {}
    };
    if (showArchived) fetchArchived();
  }, [showArchived]);
  useEffect(() => {
    loadSessions();
    // No need to log page navigation
  }, [loadSessions]);

  const handleSelectSession = async (sessionId: number) => {
    try {
      const session = await getSession(sessionId);
      setSelectedSession(session);
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  };

  const handleEditSession = (session: Session) => {
    setSessionForm({
      name: session.name,
      description: session.description,
      focus_duration: session.focus_duration,
      short_break_duration: session.short_break_duration,
      long_break_duration: session.long_break_duration,
      long_break_per_pomodoros: session.long_break_per_pomodoros,
    });
    setIsEditingSession(true);
  };

  const handleSaveSession = async () => {
    if (!selectedSession) return;
    // Basic validation: prevent saving empty/zero durations
    const {
      focus_duration,
      short_break_duration,
      long_break_duration,
      long_break_per_pomodoros,
    } = sessionForm;
    if (
      !focus_duration ||
      !short_break_duration ||
      !long_break_duration ||
      !long_break_per_pomodoros
    ) {
      toast.error(
        "Please fill all session duration fields with values greater than 0"
      );
      return;
    }

    try {
      await updateSession(selectedSession.id, sessionForm);
      setSelectedSession({ ...selectedSession, ...sessionForm });
      setIsEditingSession(false);
    } catch (error) {
      console.error("Failed to update session:", error);
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    try {
      await deleteSession(sessionId);
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const handleDuplicateSession = async (session: Session) => {
    try {
      const fullSession = await getSession(session.id);
      // Copy ALL tasks (including archived/completed) so duplication is a full clone.
      // If you want to exclude archived tasks instead, reintroduce the filter.
      const tasksToCopy = (fullSession.tasks || []).map((t) => ({
        name: t.name,
        category: (t as any).category || "Uncategorized",
        estimated_completion_time: t.estimated_completion_time,
      }));
      const copyNameBase = session.name || "Session";
      let copyName = `${copyNameBase} (Copy)`;
      // Avoid creating multiple sessions with identical names by appending a counter if needed
      let counter = 2;
      const existingNames = new Set(
        sessions.map((s) => s.name).concat(archivedSessions.map((s) => s.name))
      );
      while (existingNames.has(copyName)) {
        copyName = `${copyNameBase} (Copy ${counter})`;
        counter += 1;
      }
      const newSession = await useTaskStore.getState().createSession({
        name: copyName,
        description: session.description,
        pomodoro_config: {
          focus_duration: session.focus_duration,
          short_break_duration: session.short_break_duration,
          long_break_duration: session.long_break_duration,
          long_break_per_pomodoros: session.long_break_per_pomodoros,
        },
        tasks: tasksToCopy,
      });
      await loadSessions();
      setSelectedSession(newSession);
      toast.success("Session duplicated");
    } catch (e) {
      console.error("Failed to duplicate session", e);
      toast.error("Could not duplicate session");
    }
  };

  const handleCreateSession = async () => {
    try {
      // Validation for create session
      const {
        focus_duration,
        short_break_duration,
        long_break_duration,
        long_break_per_pomodoros,
      } = sessionForm;
      if (!sessionForm.name.trim()) {
        toast.error("Session name can't be empty");
        return;
      }
      if (
        !focus_duration ||
        !short_break_duration ||
        !long_break_duration ||
        !long_break_per_pomodoros
      ) {
        toast.error(
          "Please fill all session duration fields with values greater than 0"
        );
        return;
      }
      const sessionData = {
        name: sessionForm.name,
        description: sessionForm.description,
        pomodoro_config: {
          focus_duration: sessionForm.focus_duration,
          short_break_duration: sessionForm.short_break_duration,
          long_break_duration: sessionForm.long_break_duration,
          long_break_per_pomodoros: sessionForm.long_break_per_pomodoros,
        },
        tasks: [],
      };

      const newSession = await useTaskStore
        .getState()
        .createSession(sessionData);
      await loadSessions();
      setSelectedSession(newSession);
      setIsCreatingSession(false);
      setSessionForm({
        name: "",
        description: "",
        focus_duration: 25,
        short_break_duration: 5,
        long_break_duration: 15,
        long_break_per_pomodoros: 4,
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  const handleAddTask = async () => {
    if (!selectedSession) return;

    try {
      if (
        !taskForm.estimated_completion_time ||
        taskForm.estimated_completion_time <= 0
      ) {
        toast.error("Estimated duration must be greater than 0");
        return;
      }
      await addTaskToSession(selectedSession.id, taskForm);
      // Refresh the selected session
      const updatedSession = await getSession(selectedSession.id);
      setSelectedSession(updatedSession);
      setTaskForm({ name: "", category: "", estimated_completion_time: 30 });
      setIsAddingTask(false);
    } catch (error) {
      console.error("Failed to add task:", error);
    }
  };

  const handleEditTask = (task: Task) => {
    setTaskForm({
      name: task.name,
      category: task.category,
      estimated_completion_time: task.estimated_completion_time,
    });
    setEditingTask(task);
    setIsEditingTask(true);
  };

  const handleSaveTask = async () => {
    if (!editingTask) return;

    try {
      if (
        !taskForm.estimated_completion_time ||
        taskForm.estimated_completion_time <= 0
      ) {
        toast.error("Estimated duration must be greater than 0");
        return;
      }
      await updateTask(editingTask.id, taskForm);
      // Update the selected session
      if (selectedSession) {
        const updatedTasks = selectedSession.tasks?.map((task) =>
          task.id === editingTask.id ? { ...task, ...taskForm } : task
        );
        setSelectedSession({ ...selectedSession, tasks: updatedTasks });
      }
      setIsEditingTask(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await deleteTask(taskId);
      if (selectedSession) {
        const updatedTasks = (selectedSession.tasks || []).filter(
          (task) => task.id !== taskId
        );
        setSelectedSession({ ...selectedSession, tasks: updatedTasks });
      }
      toast.success("Task deleted");
    } catch (error) {
      console.error("Failed to delete task:", error);
      toast.error("Failed to delete task");
    }
  };

  const handleToggleComplete = async (task: Task) => {
    try {
      if (!selectedSession) return;
      if (task.completed) {
        // If archived, unarchive first so task becomes visible/editable
        if (task.archived) {
          await unarchiveTask(task.id);
        }
        await uncompleteTask(task.id);
        toast.success("Task marked as active");
      } else {
        await completeTask(task.id);
        toast.success("Task marked as completed");
      }
      const refreshed = await getSession(selectedSession.id);
      setSelectedSession(refreshed);
    } catch (e) {
      console.error("Failed to toggle task completion", e);
      toast.error("Could not update task state");
    }
  };

  const getFilteredTasks = (tasks: Task[] | undefined) => {
    if (!tasks) return [];

    switch (taskFilter) {
      case "active":
        return tasks.filter((task) => !task.completed && !task.archived);
      case "completed":
        return tasks.filter((task) => task.completed);
      case "archived":
        return tasks.filter((task) => task.archived);
      default:
        return tasks;
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !selectedSession?.tasks || taskFilter !== "all")
      return;

    const items = Array.from(selectedSession.tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update local state immediately
    setSelectedSession({ ...selectedSession, tasks: items });

    // Update on server
    try {
      const taskIds = items.map((task) => task.id);
      await reorderTasks(selectedSession.id, taskIds);
    } catch (error) {
      console.error("Failed to reorder tasks:", error);
      // Revert on error
      const originalSession = await getSession(selectedSession.id);
      setSelectedSession(originalSession);
    }
  };

  const handleMoveCompletedToBottom = async () => {
    if (!selectedSession) return;

    try {
      await moveCompletedAndArchivedToBottom(selectedSession.id);
      // Refresh the selected session to get the updated order from the server
      const updatedSession = await getSession(selectedSession.id);
      setSelectedSession(updatedSession);
    } catch (error) {
      console.error(
        "Failed to move completed/archived tasks to bottom:",
        error
      );
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading sessions...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col pb-6 gap-6 p-6 min-h-screen rounded-xl">
      <div className="w-full flex justify-between items-center backdrop-blur-sm bg-card/60 rounded-2xl p-4 py-4.5 border border-border/50 shadow-sm">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <h1 className="text-xl font-bold">Sessions</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
            <Clock className="h-4 w-4" />
            <span className="font-medium">Sessions</span>
          </div>
          <Dialog
            open={isCreatingSession}
            onOpenChange={(open) => {
              setIsCreatingSession(open);
              if (open) {
                // Reset form when opening
                setSessionForm({
                  name: "",
                  description: "",
                  focus_duration: 25,
                  short_break_duration: 5,
                  long_break_duration: 15,
                  long_break_per_pomodoros: 4,
                });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-full">
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-6">
                <div>
                  <Label htmlFor="newName">Session Name</Label>
                  <Input
                    id="newName"
                    value={sessionForm.name}
                    onChange={(e) =>
                      setSessionForm({ ...sessionForm, name: e.target.value })
                    }
                    placeholder="Enter session name"
                  />
                </div>
                <div>
                  <Label htmlFor="newDescription">Description</Label>
                  <Textarea
                    id="newDescription"
                    value={sessionForm.description}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter session description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="newFocus">Focus Duration (min)</Label>
                    <Input
                      id="newFocus"
                      type="number"
                      value={sessionForm.focus_duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({
                          ...sessionForm,
                          focus_duration: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newShort">Short Break (min)</Label>
                    <Input
                      id="newShort"
                      type="number"
                      value={sessionForm.short_break_duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({
                          ...sessionForm,
                          short_break_duration: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="newLong">Long Break (min)</Label>
                    <Input
                      id="newLong"
                      type="number"
                      value={sessionForm.long_break_duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({
                          ...sessionForm,
                          long_break_duration: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newCycles">Cycles for Long Break</Label>
                    <Input
                      id="newCycles"
                      type="number"
                      value={sessionForm.long_break_per_pomodoros}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({
                          ...sessionForm,
                          long_break_per_pomodoros: Number.isNaN(v) ? 0 : v,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleCreateSession} className="flex-1">
                    Create Session
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreatingSession(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <div className="lg:col-span-1">
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col items-start justify-between">
                  <CardTitle className="text-xl">Your Sessions</CardTitle>
                  <div className="flex flex-col items-start gap-2">
                    <div className="text-sm text-muted-foreground hidden sm:block">
                      {sessions.length}{" "}
                      {sessions.length === 1 ? "session" : "sessions"}
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant={showCompleted ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setShowCompleted((c) => !c);
                        }}
                      >
                        {showCompleted ? "Showing Completed" : "Completed"}
                      </Button>
                      <Button
                        variant={showArchived ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setShowArchived((a) => !a);
                          setShowCompleted(false);
                        }}
                      >
                        {showArchived ? "Archived" : "Archive"}
                      </Button>
                    </div>
                  </div>
                </div>
                <Input
                  placeholder="Search sessions..."
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className="h-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {(() => {
                  const base = showArchived ? archivedSessions : sessions;
                  const filteredCompleted = showArchived
                    ? base
                    : showCompleted
                    ? base
                    : base.filter((s) => !s.completed);
                  const searchLower = sessionSearch.toLowerCase();
                  const searched = searchLower
                    ? filteredCompleted.filter(
                        (s) =>
                          (s.name || "").toLowerCase().includes(searchLower) ||
                          (s.description || "")
                            .toLowerCase()
                            .includes(searchLower)
                      )
                    : filteredCompleted;
                  return searched;
                })().map((session) => (
                  <Card
                    key={session.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedSession?.id === session.id
                        ? "border-primary bg-primary/10"
                        : ""
                    }`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{session.name}</CardTitle>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {session.description}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{session.focus_duration}m focus</span>
                        {session.completed && (
                          <Badge variant="secondary" className="ml-auto">
                            Completed
                          </Badge>
                        )}
                        {session.archived && (
                          <Badge variant="outline" className="ml-auto">
                            Archived
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {sessions.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <div>No sessions found</div>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setIsCreatingSession(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first session
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session Details */}
        <div className="lg:col-span-2">
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl h-full">
            <CardContent className="p-6">
              {selectedSession ? (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {selectedSession.name}
                      </h2>
                      <p className="text-muted-foreground">
                        {selectedSession.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Dialog
                        open={isEditingSession}
                        onOpenChange={setIsEditingSession}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full"
                                onClick={() =>
                                  handleEditSession(selectedSession)
                                }
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                            </DialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Edit Session</TooltipContent>
                        </Tooltip>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Edit Session</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-6">
                            <div>
                              <Label htmlFor="name">Name</Label>
                              <Input
                                id="name"
                                value={sessionForm.name}
                                onChange={(e) =>
                                  setSessionForm({
                                    ...sessionForm,
                                    name: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="description">Description</Label>
                              <Textarea
                                id="description"
                                value={sessionForm.description}
                                onChange={(e) =>
                                  setSessionForm({
                                    ...sessionForm,
                                    description: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="focus">
                                  Focus Duration (min)
                                </Label>
                                <Input
                                  id="focus"
                                  type="number"
                                  value={sessionForm.focus_duration}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({
                                      ...sessionForm,
                                      focus_duration: Number.isNaN(v) ? 0 : v,
                                    });
                                  }}
                                />
                              </div>
                              <div>
                                <Label htmlFor="short">Short Break (min)</Label>
                                <Input
                                  id="short"
                                  type="number"
                                  value={sessionForm.short_break_duration}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({
                                      ...sessionForm,
                                      short_break_duration: Number.isNaN(v)
                                        ? 0
                                        : v,
                                    });
                                  }}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="long">Long Break (min)</Label>
                                <Input
                                  id="long"
                                  type="number"
                                  value={sessionForm.long_break_duration}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({
                                      ...sessionForm,
                                      long_break_duration: Number.isNaN(v)
                                        ? 0
                                        : v,
                                    });
                                  }}
                                />
                              </div>
                              <div>
                                <Label htmlFor="cycles">
                                  Cycles for Long Break
                                </Label>
                                <Input
                                  id="cycles"
                                  type="number"
                                  value={sessionForm.long_break_per_pomodoros}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({
                                      ...sessionForm,
                                      long_break_per_pomodoros: Number.isNaN(v)
                                        ? 0
                                        : v,
                                    });
                                  }}
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 pt-4">
                              <Button
                                onClick={handleSaveSession}
                                className="flex-1"
                              >
                                Save Changes
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setIsEditingSession(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() =>
                              handleDuplicateSession(selectedSession)
                            }
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplicate Session</TooltipContent>
                      </Tooltip>

                      {!selectedSession.archived ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={async () => {
                                await archiveSession(selectedSession.id);
                                const refreshed = await getSession(
                                  selectedSession.id
                                );
                                setSelectedSession(refreshed);
                              }}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Archive Session</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={async () => {
                                await unarchiveSession(selectedSession.id);
                                const refreshed = await getSession(
                                  selectedSession.id
                                );
                                setSelectedSession(refreshed);
                              }}
                            >
                              <ArchiveRestore className="h-4 w-4 mr-2" />
                              Unarchive
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Unarchive Session</TooltipContent>
                        </Tooltip>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-full"
                            onClick={() =>
                              handleDeleteSession(selectedSession.id)
                            }
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete Session</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Session Config */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold">
                          {selectedSession.focus_duration}m
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Focus Duration
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold">
                          {selectedSession.short_break_duration}m
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Short Break
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold">
                          {selectedSession.long_break_duration}m
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Long Break
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold">
                          {selectedSession.long_break_per_pomodoros}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Cycles for Long Break
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Tasks */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold">Tasks</h3>
                      <Dialog
                        open={isAddingTask}
                        onOpenChange={setIsAddingTask}
                      >
                        <DialogTrigger asChild>
                          <Button
                            onClick={() => setIsAddingTask(true)}
                            className="rounded-full"
                            size="sm"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Task
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Add New Task</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-6">
                            <div>
                              <Label htmlFor="taskName">Task Name</Label>
                              <Input
                                id="taskName"
                                value={taskForm.name}
                                onChange={(e) =>
                                  setTaskForm({
                                    ...taskForm,
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Enter task name"
                              />
                            </div>
                            <div>
                              <Label htmlFor="category">Category</Label>
                              <Input
                                id="category"
                                value={taskForm.category}
                                onChange={(e) =>
                                  setTaskForm({
                                    ...taskForm,
                                    category: e.target.value,
                                  })
                                }
                                placeholder="Enter category"
                              />
                            </div>
                            <div>
                              <Label htmlFor="duration">
                                Estimated Duration (minutes)
                              </Label>
                              <Input
                                id="duration"
                                type="number"
                                value={
                                  taskForm.estimated_completion_time === 0
                                    ? ""
                                    : taskForm.estimated_completion_time
                                }
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setTaskForm({
                                    ...taskForm,
                                    estimated_completion_time: Number.isNaN(v)
                                      ? 0
                                      : v,
                                  });
                                }}
                              />
                            </div>
                            <div className="flex gap-2 pt-4">
                              <Button
                                onClick={handleAddTask}
                                className="flex-1"
                              >
                                Add Task
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setIsAddingTask(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Task Filters */}
                  <div className="flex flex-col gap-2 mb-4">
                    <div className="flex gap-2">
                      <Button
                        variant={taskFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTaskFilter("all")}
                      >
                        All Tasks ({selectedSession.tasks?.length || 0})
                      </Button>
                      <Button
                        variant={
                          taskFilter === "active" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setTaskFilter("active")}
                      >
                        Active (
                        {selectedSession.tasks?.filter(
                          (t) => !t.completed && !t.archived
                        ).length || 0}
                        )
                      </Button>
                      <Button
                        variant={
                          taskFilter === "completed" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setTaskFilter("completed")}
                      >
                        Completed (
                        {selectedSession.tasks?.filter((t) => t.completed)
                          .length || 0}
                        )
                      </Button>
                      <Button
                        variant={
                          taskFilter === "archived" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setTaskFilter("archived")}
                      >
                        Archived (
                        {selectedSession.tasks?.filter((t) => t.archived)
                          .length || 0}
                        )
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      {taskFilter !== "all" && (
                        <p className="text-xs text-muted-foreground">
                          Task reordering is only available when viewing all
                          tasks
                        </p>
                      )}
                      {taskFilter === "all" &&
                        selectedSession.tasks &&
                        selectedSession.tasks.some(
                          (t) => t.completed || t.archived
                        ) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMoveCompletedToBottom}
                            className="ml-auto"
                          >
                            <ArrowDown className="h-4 w-4 mr-2" />
                            Move Completed/Archived to Bottom
                          </Button>
                        )}
                    </div>
                  </div>

                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="tasks">
                      {(provided: DroppableProvided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-3"
                        >
                          {getFilteredTasks(selectedSession.tasks)?.map(
                            (task, index) => (
                              <Draggable
                                key={task.id}
                                draggableId={task.id.toString()}
                                index={index}
                                isDragDisabled={taskFilter !== "all"}
                              >
                                {(
                                  provided: DraggableProvided,
                                  snapshot: DraggableStateSnapshot
                                ) => (
                                  <Card
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`bg-card/60 backdrop-blur-sm ${
                                      snapshot.isDragging
                                        ? "shadow-lg"
                                        : "shadow-sm"
                                    } hover:shadow-md transition-all ${
                                      task.completed
                                        ? " border-green-800"
                                        : task.archived
                                        ? " border-gray-800"
                                        : ""
                                    }`}
                                  >
                                    <CardContent className="p-4">
                                      <div className="flex items-center gap-3">
                                        <div {...provided.dragHandleProps}>
                                          <GripVertical
                                            className={`h-5 w-5 ${
                                              taskFilter === "all"
                                                ? "text-muted-foreground cursor-grab"
                                                : "text-muted-foreground/30 cursor-not-allowed"
                                            }`}
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium">
                                              {task.name}
                                            </h4>
                                          </div>
                                          <div className="flex items-start gap-2 flex-wrap mb-1">
                                            <Badge variant="secondary">
                                              {task.category}
                                            </Badge>
                                            {task.completed && (
                                              <Badge variant="default">
                                                Completed
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Target className="h-3 w-3" />
                                            <span>
                                              {task.estimated_completion_time}{" "}
                                              minutes
                                            </span>
                                            {task.actual_completion_time && (
                                              <span>
                                                • Actual:{" "}
                                                {task.actual_completion_time}{" "}
                                                minutes
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                  handleToggleComplete(task)
                                                }
                                                aria-label={
                                                  task.completed
                                                    ? "Uncomplete task"
                                                    : "Complete task"
                                                }
                                                title={
                                                  task.completed
                                                    ? "Uncomplete"
                                                    : "Complete"
                                                }
                                                disabled={
                                                  task.archived &&
                                                  !task.completed
                                                }
                                              >
                                                {task.completed ? (
                                                  <Undo2 className="h-4 w-4" />
                                                ) : (
                                                  <Check className="h-4 w-4" />
                                                )}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              {task.completed
                                                ? "Mark as Incomplete"
                                                : "Mark as Complete"}
                                            </TooltipContent>
                                          </Tooltip>
                                          <Dialog
                                            open={
                                              isEditingTask &&
                                              editingTask?.id === task.id
                                            }
                                            onOpenChange={setIsEditingTask}
                                          >
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <DialogTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                      handleEditTask(task)
                                                    }
                                                  >
                                                    <Edit className="h-4 w-4" />
                                                  </Button>
                                                </DialogTrigger>
                                              </TooltipTrigger>
                                              <TooltipContent>Edit Task</TooltipContent>
                                            </Tooltip>
                                            <DialogContent className="sm:max-w-[425px]">
                                              <DialogHeader>
                                                <DialogTitle>
                                                  Edit Task
                                                </DialogTitle>
                                              </DialogHeader>
                                              <div className="space-y-4 mt-6">
                                                <div>
                                                  <Label htmlFor="editTaskName">
                                                    Task Name
                                                  </Label>
                                                  <Input
                                                    id="editTaskName"
                                                    value={taskForm.name}
                                                    onChange={(e) =>
                                                      setTaskForm({
                                                        ...taskForm,
                                                        name: e.target.value,
                                                      })
                                                    }
                                                  />
                                                </div>
                                                <div>
                                                  <Label htmlFor="editCategory">
                                                    Category
                                                  </Label>
                                                  <Input
                                                    id="editCategory"
                                                    value={taskForm.category}
                                                    onChange={(e) =>
                                                      setTaskForm({
                                                        ...taskForm,
                                                        category:
                                                          e.target.value,
                                                      })
                                                    }
                                                  />
                                                </div>
                                                <div>
                                                  <Label htmlFor="editDuration">
                                                    Estimated Duration (minutes)
                                                  </Label>
                                                  <Input
                                                    id="editDuration"
                                                    type="number"
                                                    value={
                                                      taskForm.estimated_completion_time ===
                                                      0
                                                        ? ""
                                                        : taskForm.estimated_completion_time
                                                    }
                                                    onChange={(e) => {
                                                      const v = parseInt(
                                                        e.target.value,
                                                        10
                                                      );
                                                      setTaskForm({
                                                        ...taskForm,
                                                        estimated_completion_time:
                                                          Number.isNaN(v)
                                                            ? 0
                                                            : v,
                                                      });
                                                    }}
                                                  />
                                                </div>
                                                <div className="flex gap-2 pt-4">
                                                  <Button
                                                    onClick={handleSaveTask}
                                                    className="flex-1"
                                                  >
                                                    Save Changes
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    onClick={() =>
                                                      setIsEditingTask(false)
                                                    }
                                                  >
                                                    Cancel
                                                  </Button>
                                                </div>
                                              </div>
                                            </DialogContent>
                                          </Dialog>

                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                  handleDeleteTask(task.id)
                                                }
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Delete Task</TooltipContent>
                                          </Tooltip>
                                          {!task.archived ? (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={async () => {
                                                    await archiveTask(task.id);
                                                    if (selectedSession) {
                                                      const refreshed =
                                                        await getSession(
                                                          selectedSession.id
                                                        );
                                                      setSelectedSession(refreshed);
                                                    }
                                                  }}
                                                >
                                                  <Archive className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>Archive Task</TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={async () => {
                                                    await unarchiveTask(task.id);
                                                    if (selectedSession) {
                                                      const refreshed =
                                                        await getSession(
                                                          selectedSession.id
                                                        );
                                                      setSelectedSession(refreshed);
                                                    }
                                                  }}
                                                >
                                                  <ArchiveRestore className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>Unarchive Task</TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </Draggable>
                            )
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>

                  {getFilteredTasks(selectedSession.tasks)?.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <div>
                        {taskFilter === "all"
                          ? "No tasks yet. Add some tasks to get started!"
                          : taskFilter === "active"
                          ? "No active tasks found."
                          : taskFilter === "completed"
                          ? "No completed tasks found."
                          : "No archived tasks found."}
                      </div>
                      {taskFilter === "all" && (
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => setIsAddingTask(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add your first task
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <div>Select a session to view details</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
