import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Plus, Edit, Trash2, GripVertical, Clock, Target, Archive, ArchiveRestore, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useTaskStore, type Session, type Task } from "~/stores/tasks";
import { useAnalyticsStore } from "~/stores/analytics";
import { DragDropContext, Droppable, Draggable, type DropResult, type DroppableProvided, type DraggableProvided, type DraggableStateSnapshot } from "@hello-pangea/dnd";
import { SidebarTrigger } from "~/components/ui/sidebar";

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
  const [archivedSessions, setArchivedSessions] = useState<Session[]>([]);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'completed' | 'archived'>('all');

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
    const { focus_duration, short_break_duration, long_break_duration, long_break_per_pomodoros } = sessionForm;
    if (!focus_duration || !short_break_duration || !long_break_duration || !long_break_per_pomodoros) {
      toast.error("Please fill all session duration fields with values greater than 0");
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
  
  const handleCreateSession = async () => {
    try {
      // Validation for create session
      const { focus_duration, short_break_duration, long_break_duration, long_break_per_pomodoros } = sessionForm;
      if (!sessionForm.name.trim()) {
        toast.error("Session name can't be empty");
        return;
      }
      if (!focus_duration || !short_break_duration || !long_break_duration || !long_break_per_pomodoros) {
        toast.error("Please fill all session duration fields with values greater than 0");
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
        tasks: []
      };
      
      const newSession = await useTaskStore.getState().createSession(sessionData);
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
      if (!taskForm.estimated_completion_time || taskForm.estimated_completion_time <= 0) {
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
      if (!taskForm.estimated_completion_time || taskForm.estimated_completion_time <= 0) {
        toast.error("Estimated duration must be greater than 0");
        return;
      }
      await updateTask(editingTask.id, taskForm);
      // Update the selected session
      if (selectedSession) {
        const updatedTasks = selectedSession.tasks?.map(task =>
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
    // Archive instead of delete
    try {
      await archiveTask(taskId);
      if (selectedSession) {
        const updatedTasks = selectedSession.tasks?.map(task =>
          task.id === taskId ? { ...task, archived: true } : task
        );
        setSelectedSession({ ...selectedSession, tasks: updatedTasks });
      }
      toast.success("Task archived");
    } catch (error) {
      console.error("Failed to archive task:", error);
      toast.error("Failed to archive task");
    }
  };

  const getFilteredTasks = (tasks: Task[] | undefined) => {
    if (!tasks) return [];
    
    switch (taskFilter) {
      case 'active':
        return tasks.filter(task => !task.completed && !task.archived);
      case 'completed':
        return tasks.filter(task => task.completed);
      case 'archived':
        return tasks.filter(task => task.archived);
      default:
        return tasks;
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !selectedSession?.tasks || taskFilter !== 'all') return;

    const items = Array.from(selectedSession.tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update local state immediately
    setSelectedSession({ ...selectedSession, tasks: items });

    // Update on server
    try {
      const taskIds = items.map(task => task.id);
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
      console.error("Failed to move completed/archived tasks to bottom:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground text-sm">Loading sessions...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col pb-8 gap-8 p-8 min-h-screen">
      {/* Header Bar */}
      <div className="w-full flex justify-between items-center backdrop-blur-md bg-card/70 rounded-xl p-4 border border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              Sessions
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-border/30">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>
          <Dialog open={isCreatingSession} onOpenChange={(open) => {
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
          }}>
            <DialogTrigger asChild>
              <Button 
                className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300 rounded-full px-6 py-2 text-sm font-medium"
              >
                <Plus className="h-4 w-4 " />
                New Custom Session
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-lg">Create New Session</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                <div>
                  <Label htmlFor="newName" className="text-sm">Session Name</Label>
                  <Input
                    id="newName"
                    value={sessionForm.name}
                    onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                    placeholder="Enter session name"
                    className="rounded-lg text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="newDescription" className="text-sm">Description</Label>
                  <Textarea
                    id="newDescription"
                    value={sessionForm.description}
                    onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
                    placeholder="Enter session description"
                    className="rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="newFocus" className="text-sm">Focus Duration (min)</Label>
                    <Input
                      id="newFocus"
                      type="number"
                      value={sessionForm.focus_duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({ ...sessionForm, focus_duration: Number.isNaN(v) ? 0 : v });
                      }}
                      className="rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newShort" className="text-sm">Short Break (min)</Label>
                    <Input
                      id="newShort"
                      type="number"
                      value={sessionForm.short_break_duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({ ...sessionForm, short_break_duration: Number.isNaN(v) ? 0 : v });
                      }}
                      className="rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="newLong" className="text-sm">Long Break (min)</Label>
                    <Input
                      id="newLong"
                      type="number"
                      value={sessionForm.long_break_duration}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({ ...sessionForm, long_break_duration: Number.isNaN(v) ? 0 : v });
                      }}
                      className="rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newCycles" className="text-sm">Cycles for Long Break</Label>
                    <Input
                      id="newCycles"
                      type="number"
                      value={sessionForm.long_break_per_pomodoros}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setSessionForm({ ...sessionForm, long_break_per_pomodoros: Number.isNaN(v) ? 0 : v });
                      }}
                      className="rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-3">
                  <Button onClick={handleCreateSession} className="flex-1 rounded-lg text-sm">
                    Create Session
                  </Button>
                  <Button variant="outline" onClick={() => setIsCreatingSession(false)} className="rounded-lg text-sm">
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sessions List */}
        <div className="lg:col-span-1">
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl overflow-hidden">
            <CardHeader className="pb-2 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Your Sessions</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowArchived(a => !a)} className="text-xs rounded-lg">
                    {showArchived ? 'Hide Archived' : 'Show Archived'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="space-y-2">
                {(showArchived ? archivedSessions : sessions).map((session) => (
                  <Card
                    key={session.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedSession?.id === session.id ? "border-primary bg-primary/10" : ""
                    }`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{session.name}</CardTitle>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {session.description}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{session.focus_duration}m focus</span>
                        {session.completed && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            Completed
                          </Badge>
                        )}
                        {session.archived && (
                          <Badge variant="outline" className="ml-auto text-xs">Archived</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {sessions.length === 0 && (
                  <div className="text-center text-muted-foreground py-6">
                    <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <div className="text-sm">No sessions found</div>
                    <Button 
                      variant="outline" 
                      className="mt-3 text-xs rounded-lg"
                      onClick={() => setIsCreatingSession(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
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
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl h-full">
            <CardContent className="p-4">
              {selectedSession ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold">{selectedSession.name}</h2>
                      <p className="text-muted-foreground text-sm">{selectedSession.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Dialog open={isEditingSession} onOpenChange={setIsEditingSession}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => handleEditSession(selectedSession)}>
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px] rounded-xl">
                          <DialogHeader>
                            <DialogTitle className="text-lg">Edit Session</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 mt-4">
                            <div>
                              <Label htmlFor="name" className="text-sm">Name</Label>
                              <Input
                                id="name"
                                value={sessionForm.name}
                                onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                                className="rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor="description" className="text-sm">Description</Label>
                              <Textarea
                                id="description"
                                value={sessionForm.description}
                                onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
                                className="rounded-lg text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="focus" className="text-sm">Focus Duration (min)</Label>
                                <Input
                                  id="focus"
                                  type="number"
                                  value={sessionForm.focus_duration}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({ ...sessionForm, focus_duration: Number.isNaN(v) ? 0 : v });
                                  }}
                                  className="rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <Label htmlFor="short" className="text-sm">Short Break (min)</Label>
                                <Input
                                  id="short"
                                  type="number"
                                  value={sessionForm.short_break_duration}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({ ...sessionForm, short_break_duration: Number.isNaN(v) ? 0 : v });
                                  }}
                                  className="rounded-lg text-sm"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="long" className="text-sm">Long Break (min)</Label>
                                <Input
                                  id="long"
                                  type="number"
                                  value={sessionForm.long_break_duration}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({ ...sessionForm, long_break_duration: Number.isNaN(v) ? 0 : v });
                                  }}
                                  className="rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <Label htmlFor="cycles" className="text-sm">Cycles for Long Break</Label>
                                <Input
                                  id="cycles"
                                  type="number"
                                  value={sessionForm.long_break_per_pomodoros}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setSessionForm({ ...sessionForm, long_break_per_pomodoros: Number.isNaN(v) ? 0 : v });
                                  }}
                                  className="rounded-lg text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 pt-3">
                              <Button onClick={handleSaveSession} className="flex-1 rounded-lg text-sm">
                                Save Changes
                              </Button>
                              <Button variant="outline" onClick={() => setIsEditingSession(false)} className="rounded-lg text-sm">
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      {!selectedSession.archived ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="rounded-lg text-xs"
                          onClick={async () => { await archiveSession(selectedSession.id); const refreshed = await getSession(selectedSession.id); setSelectedSession(refreshed); }}
                        >
                          <Archive className="h-3 w-3 mr-1" />
                          Archive
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="rounded-lg text-xs"
                          onClick={async () => { await unarchiveSession(selectedSession.id); const refreshed = await getSession(selectedSession.id); setSelectedSession(refreshed); }}
                        >
                          <ArchiveRestore className="h-3 w-3 mr-1" />
                          Unarchive
                        </Button>
                      )}
                      
                      <Button 
                        variant="destructive" 
                        size="sm"
                        className="rounded-lg text-xs"
                        onClick={() => handleDeleteSession(selectedSession.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Session Config */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-3">
                        <div className="text-lg font-bold">{selectedSession.focus_duration}m</div>
                        <div className="text-xs text-muted-foreground">Focus Duration</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-3">
                        <div className="text-lg font-bold">{selectedSession.short_break_duration}m</div>
                        <div className="text-xs text-muted-foreground">Short Break</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-3">
                        <div className="text-lg font-bold">{selectedSession.long_break_duration}m</div>
                        <div className="text-xs text-muted-foreground">Long Break</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-3">
                        <div className="text-lg font-bold">{selectedSession.long_break_per_pomodoros}</div>
                        <div className="text-xs text-muted-foreground">Cycles for Long Break</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Tasks */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Tasks</h3>
                      <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
                        <DialogTrigger asChild>
                          <Button onClick={() => setIsAddingTask(true)} className="rounded-lg text-xs" size="sm">
                            <Plus className="h-3 w-3 mr-1" />
                            Add Task
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px] rounded-xl">
                          <DialogHeader>
                            <DialogTitle className="text-lg">Add New Task</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 mt-4">
                            <div>
                              <Label htmlFor="taskName" className="text-sm">Task Name</Label>
                              <Input
                                id="taskName"
                                value={taskForm.name}
                                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                placeholder="Enter task name"
                                className="rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor="category" className="text-sm">Category</Label>
                              <Input
                                id="category"
                                value={taskForm.category}
                                onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                placeholder="Enter category"
                                className="rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor="duration" className="text-sm">Estimated Duration (minutes)</Label>
                              <Input
                                id="duration"
                                type="number"
                                value={taskForm.estimated_completion_time === 0 ? "" : taskForm.estimated_completion_time}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setTaskForm({ ...taskForm, estimated_completion_time: Number.isNaN(v) ? 0 : v });
                                }}
                                className="rounded-lg text-sm"
                              />
                            </div>
                            <div className="flex gap-2 pt-3">
                              <Button onClick={handleAddTask} className="flex-1 rounded-lg text-sm">
                                Add Task
                              </Button>
                              <Button variant="outline" onClick={() => setIsAddingTask(false)} className="rounded-lg text-sm">
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    </div>

                    {/* Task Filters */}
                    <div className="flex flex-col gap-2 mb-3">
                      <div className="flex gap-2">
                        <Button
                          variant={taskFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTaskFilter('all')}
                          className="text-xs rounded-lg"
                        >
                          All Tasks ({selectedSession.tasks?.length || 0})
                        </Button>
                        <Button
                          variant={taskFilter === 'active' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTaskFilter('active')}
                          className="text-xs rounded-lg"
                        >
                          Active ({selectedSession.tasks?.filter(t => !t.completed && !t.archived).length || 0})
                        </Button>
                        <Button
                          variant={taskFilter === 'completed' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTaskFilter('completed')}
                          className="text-xs rounded-lg"
                        >
                          Completed ({selectedSession.tasks?.filter(t => t.completed).length || 0})
                        </Button>
                        <Button
                          variant={taskFilter === 'archived' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTaskFilter('archived')}
                          className="text-xs rounded-lg"
                        >
                          Archived ({selectedSession.tasks?.filter(t => t.archived).length || 0})
                        </Button>
                      </div>
                      <div className="flex justify-between items-center">
                        {taskFilter !== 'all' && (
                          <p className="text-xs text-muted-foreground">
                            Task reordering is only available when viewing all tasks
                          </p>
                        )}
                        {taskFilter === 'all' && selectedSession.tasks &&
                         selectedSession.tasks.some(t => t.completed || t.archived) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMoveCompletedToBottom}
                            className="ml-auto text-xs rounded-lg"
                          >
                            <ArrowDown className="h-3 w-3 mr-1" />
                            Move Completed/Archived to Bottom
                          </Button>
                        )}
                      </div>
                    </div>

                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="tasks">
                        {(provided: DroppableProvided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                            {getFilteredTasks(selectedSession.tasks)?.map((task, index) => (
                              <Draggable
                                key={task.id}
                                draggableId={task.id.toString()}
                                index={index}
                                isDragDisabled={taskFilter !== 'all'}
                              >
                                {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                                  <Card
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`bg-card/60 backdrop-blur-sm ${snapshot.isDragging ? "shadow-md" : "shadow-sm"} hover:shadow-md transition-all ${
                                      task.completed ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" :
                                      task.archived ? "bg-gray-50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-800" : ""
                                    }`}
                                  >
                                    <CardContent className="p-3">
                                      <div className="flex items-center gap-2">
                                        <div {...provided.dragHandleProps}>
                                          <GripVertical
                                            className={`h-4 w-4 ${
                                              taskFilter === 'all'
                                                ? 'text-muted-foreground cursor-grab'
                                                : 'text-muted-foreground/30 cursor-not-allowed'
                                            }`}
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium text-sm">{task.name}</h4>
                                            <Badge variant="secondary" className="text-xs">{task.category}</Badge>
                                            {task.completed && (
                                              <Badge variant="default" className="text-xs">Completed</Badge>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Target className="h-3 w-3" />
                                            <span>{task.estimated_completion_time} minutes</span>
                                            {task.actual_completion_time && (
                                              <span>• Actual: {task.actual_completion_time} minutes</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex gap-1">
                                          <Dialog open={isEditingTask && editingTask?.id === task.id} onOpenChange={setIsEditingTask}>
                                            <DialogTrigger asChild>
                                              <Button variant="ghost" size="sm" onClick={() => handleEditTask(task)} className="h-7 w-7 p-0">
                                                <Edit className="h-3 w-3" />
                                              </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[400px] rounded-xl">
                                              <DialogHeader>
                                                <DialogTitle className="text-lg">Edit Task</DialogTitle>
                                              </DialogHeader>
                                              <div className="space-y-3 mt-4">
                                                <div>
                                                  <Label htmlFor="editTaskName" className="text-sm">Task Name</Label>
                                                  <Input
                                                    id="editTaskName"
                                                    value={taskForm.name}
                                                    onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                                    className="rounded-lg text-sm"
                                                  />
                                                </div>
                                                <div>
                                                  <Label htmlFor="editCategory" className="text-sm">Category</Label>
                                                  <Input
                                                    id="editCategory"
                                                    value={taskForm.category}
                                                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                                    className="rounded-lg text-sm"
                                                  />
                                                </div>
                                                <div>
                                                  <Label htmlFor="editDuration" className="text-sm">Estimated Duration (minutes)</Label>
                                                  <Input
                                                    id="editDuration"
                                                    type="number"
                                                    value={taskForm.estimated_completion_time === 0 ? "" : taskForm.estimated_completion_time}
                                                    onChange={(e) => {
                                                      const v = parseInt(e.target.value, 10);
                                                      setTaskForm({ ...taskForm, estimated_completion_time: Number.isNaN(v) ? 0 : v });
                                                    }}
                                                    className="rounded-lg text-sm"
                                                  />
                                                </div>
                                                <div className="flex gap-2 pt-3">
                                                  <Button onClick={handleSaveTask} className="flex-1 rounded-lg text-sm">
                                                    Save Changes
                                                  </Button>
                                                  <Button variant="outline" onClick={() => setIsEditingTask(false)} className="rounded-lg text-sm">
                                                    Cancel
                                                  </Button>
                                                </div>
                                              </div>
                                            </DialogContent>
                                          </Dialog>

                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                          {!task.archived ? (
                                            <Button variant="ghost" size="sm" onClick={async () => { await archiveTask(task.id); if(selectedSession){ const refreshed = await getSession(selectedSession.id); setSelectedSession(refreshed);} }} className="h-7 w-7 p-0">
                                              <Archive className="h-3 w-3" />
                                            </Button>
                                          ) : (
                                            <Button variant="ghost" size="sm" onClick={async () => { await unarchiveTask(task.id); if(selectedSession){ const refreshed = await getSession(selectedSession.id); setSelectedSession(refreshed);} }} className="h-7 w-7 p-0">
                                              <ArchiveRestore className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>

                    {(getFilteredTasks(selectedSession.tasks)?.length === 0) && (
                      <div className="text-center text-muted-foreground py-6">
                        <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <div className="text-sm">
                          {taskFilter === 'all'
                            ? "No tasks yet. Add some tasks to get started!"
                            : taskFilter === 'active'
                            ? "No active tasks found."
                            : taskFilter === 'completed'
                            ? "No completed tasks found."
                            : "No archived tasks found."
                          }
                        </div>
                        {taskFilter === 'all' && (
                          <Button
                            variant="outline"
                            className="mt-3 text-xs rounded-lg"
                            onClick={() => setIsAddingTask(true)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add your first task
                          </Button>
                        )}
                      </div>
                    )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center text-muted-foreground">
                    <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <div className="text-sm">Select a session to view details</div>
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
