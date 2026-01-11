import { useEffect, useState, useCallback, useMemo } from "react";
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
import { Button } from "~/components/ui/button";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { useTaskStore, type Session, type Task } from "~/stores/tasks";
import { useAnalyticsStore } from "~/stores/analytics";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { SessionList } from "~/components/pomotoro/sessions/SessionList";
import { SessionDetail } from "~/components/pomotoro/sessions/SessionDetail";
import type { DropResult } from "@hello-pangea/dnd";

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
  
  // Dialog States
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
    due_date: "",
  });

  useEffect(() => {
    const fetchArchived = async () => {
      try {
        const archived = await loadArchivedSessions();
        setArchivedSessions(archived);
      } catch (e) {}
    };
    if (showArchived) fetchArchived();
  }, [showArchived, loadArchivedSessions]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = useCallback(async (sessionId: number) => {
    try {
      const session = await getSession(sessionId);
      setSelectedSession(session);
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  }, [getSession]);

  // --- Session Handlers ---

  const handleEditSession = useCallback((session: Session) => {
    setSessionForm({
      name: session.name,
      description: session.description,
      focus_duration: session.focus_duration,
      short_break_duration: session.short_break_duration,
      long_break_duration: session.long_break_duration,
      long_break_per_pomodoros: session.long_break_per_pomodoros,
    });
    setIsEditingSession(true);
  }, []);

  const handleSaveSession = useCallback(async () => {
    if (!selectedSession) return;
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
  }, [selectedSession, sessionForm, updateSession]);

  const handleDeleteSession = useCallback(async (sessionId: number) => {
    try {
      await deleteSession(sessionId);
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  }, [deleteSession, selectedSession]);

  const handleDuplicateSession = useCallback(async (session: Session) => {
    try {
      const fullSession = await getSession(session.id);
      const tasksToCopy = (fullSession.tasks || []).map((t) => ({
        name: t.name,
        category: (t as any).category || "Uncategorized",
        estimated_completion_time: t.estimated_completion_time,
        due_date: (t as any).due_date || undefined,
      }));
      const copyNameBase = session.name || "Session";
      let copyName = `${copyNameBase} (Copy)`;
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
  }, [sessions, archivedSessions, getSession, loadSessions]);

  const handleCreateSession = useCallback(async () => {
    try {
      if (!sessionForm.name.trim()) {
        toast.error("Session name can't be empty");
        return;
      }
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
  }, [sessionForm, loadSessions]);

  const handleArchiveSession = useCallback(async (sessionId: number) => {
    try {
      await archiveSession(sessionId);
      const refreshed = await getSession(sessionId);
      setSelectedSession(refreshed);
    } catch (e) {
      console.error("Failed to archive session", e);
    }
  }, [archiveSession, getSession]);

  const handleUnarchiveSession = useCallback(async (sessionId: number) => {
    try {
      await unarchiveSession(sessionId);
      const refreshed = await getSession(sessionId);
      setSelectedSession(refreshed);
    } catch (e) {
      console.error("Failed to unarchive session", e);
    }
  }, [unarchiveSession, getSession]);

  // --- Task Handlers ---

  const handleAddTask = useCallback(async () => {
    if (!selectedSession) return;
    try {
      if (
        !taskForm.estimated_completion_time ||
        taskForm.estimated_completion_time <= 0
      ) {
        toast.error("Estimated duration must be greater than 0");
        return;
      }
      
      const payload = {
        name: taskForm.name,
        category: taskForm.category,
        estimated_completion_time: taskForm.estimated_completion_time,
        due_date: taskForm.due_date
          ? new Date(`${taskForm.due_date}T00:00:00`).toISOString()
          : undefined,
      };
      
      await addTaskToSession(selectedSession.id, payload);
      const updatedSession = await getSession(selectedSession.id);
      setSelectedSession(updatedSession);
      
      setTaskForm({ name: "", category: "", estimated_completion_time: 30, due_date: "" });
      setIsAddingTask(false);
    } catch (error) {
      console.error("Failed to add task:", error);
    }
  }, [selectedSession, taskForm, addTaskToSession, getSession]);

  const openEditTaskDialog = useCallback((task: Task) => {
    setTaskForm({
      name: task.name,
      category: task.category,
      estimated_completion_time: task.estimated_completion_time,
      due_date: (task as any).due_date ? (task as any).due_date.slice(0, 10) : "",
    });
    setEditingTask(task);
    setIsEditingTask(true);
  }, []);

  const handleSaveTask = useCallback(async () => {
    if (!editingTask || !selectedSession) return;
    try {
      if (
        !taskForm.estimated_completion_time ||
        taskForm.estimated_completion_time <= 0
      ) {
        toast.error("Estimated duration must be greater than 0");
        return;
      }
      
      const payload = {
        name: taskForm.name,
        category: taskForm.category,
        estimated_completion_time: taskForm.estimated_completion_time,
        due_date: taskForm.due_date
          ? new Date(`${taskForm.due_date}T00:00:00`).toISOString()
          : undefined,
      };
      
      await updateTask(editingTask.id, payload);
      
      // Explicitly update local state for immediate feedback
      const updatedTasks = selectedSession.tasks.map((task) =>
        task.id === editingTask.id ? { ...task, ...payload } : task
      );
      setSelectedSession({ ...selectedSession, tasks: updatedTasks });
      
      setIsEditingTask(false);
      setEditingTask(null);
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  }, [editingTask, selectedSession, taskForm, updateTask]);

  const handleDeleteTask = useCallback(async (taskId: number) => {
    if (!selectedSession) return;
    try {
      await deleteTask(taskId);
      const updatedTasks = selectedSession.tasks.filter((task) => task.id !== taskId);
      setSelectedSession({ ...selectedSession, tasks: updatedTasks });
      toast.success("Task deleted");
    } catch (error) {
      console.error("Failed to delete task:", error);
      toast.error("Failed to delete task");
    }
  }, [selectedSession, deleteTask]);

  const handleToggleComplete = useCallback(async (task: Task) => {
    if (!selectedSession) return;
    try {
      if (task.completed) {
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
  }, [selectedSession, unarchiveTask, uncompleteTask, completeTask, getSession]);
  
  const handleArchiveTask = useCallback(async (taskId: number) => {
    if (!selectedSession) return;
    try {
      await archiveTask(taskId);
      const refreshed = await getSession(selectedSession.id);
      setSelectedSession(refreshed);
    } catch (e) { console.error(e); }
  }, [selectedSession, archiveTask, getSession]);

  const handleUnarchiveTask = useCallback(async (taskId: number) => {
    if (!selectedSession) return;
    try {
      await unarchiveTask(taskId);
      const refreshed = await getSession(selectedSession.id);
      setSelectedSession(refreshed);
    } catch (e) { console.error(e); }
  }, [selectedSession, unarchiveTask, getSession]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || !selectedSession?.tasks || taskFilter !== "all")
      return;

    const items = Array.from(selectedSession.tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update local state immediately
    setSelectedSession({ ...selectedSession, tasks: items });

    try {
      const taskIds = items.map((task) => task.id);
      await reorderTasks(selectedSession.id, taskIds);
    } catch (error) {
      console.error("Failed to reorder tasks:", error);
      // Revert on error
      const originalSession = await getSession(selectedSession.id);
      setSelectedSession(originalSession);
    }
  }, [selectedSession, taskFilter, reorderTasks, getSession]);

  const handleMoveCompletedToBottom = useCallback(async () => {
    if (!selectedSession) return;
    try {
      await moveCompletedAndArchivedToBottom(selectedSession.id);
      const updatedSession = await getSession(selectedSession.id);
      setSelectedSession(updatedSession);
    } catch (error) {
      console.error("Failed to move completed/archived tasks to bottom:", error);
    }
  }, [selectedSession, moveCompletedAndArchivedToBottom, getSession]);

  // Derived state for sessions list
  const filteredSessions = useMemo(() => {
    const base = showArchived ? archivedSessions : sessions;
    const filteredByCompletion = showArchived
      ? base
      : showCompleted
      ? base
      : base.filter((s) => !s.completed);
    
    const searchLower = sessionSearch.toLowerCase();
    return searchLower
      ? filteredByCompletion.filter(
          (s) =>
            (s.name || "").toLowerCase().includes(searchLower) ||
            (s.description || "").toLowerCase().includes(searchLower)
        )
      : filteredByCompletion;
  }, [showArchived, archivedSessions, sessions, showCompleted, sessionSearch]);

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
    <main className="flex flex-col pb-4 sm:pb-6 gap-4 sm:gap-6 p-3 sm:p-6 min-h-screen rounded-xl">
      {/* Top Bar */}
      <div className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 backdrop-blur-sm bg-card/60 rounded-2xl p-3 sm:p-4 py-3 sm:py-4.5 border border-border/50 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <SidebarTrigger />
          <h1 className="text-lg sm:text-xl font-bold">Sessions</h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
            <Clock className="h-4 w-4" />
            <span className="font-medium">Sessions</span>
          </div>
          
          <Button 
             size="sm" 
             variant="outline" 
             className="rounded-full text-xs sm:text-sm px-3 sm:px-4 flex-1 sm:flex-none"
             onClick={() => {
                setSessionForm({
                  name: "",
                  description: "",
                  focus_duration: 25,
                  short_break_duration: 5,
                  long_break_duration: 15,
                  long_break_per_pomodoros: 4,
                });
                setIsCreatingSession(true);
             }}
          >
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">New Session</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-1">
          <SessionList
            sessions={filteredSessions}
            selectedSessionId={selectedSession?.id}
            showCompleted={showCompleted}
            showArchived={showArchived}
            searchQuery={sessionSearch}
            onSearchChange={setSessionSearch}
            onToggleCompleted={() => setShowCompleted(!showCompleted)}
            onToggleArchived={() => setShowArchived(!showArchived)}
            onSelectSession={handleSelectSession}
            onCreateSession={() => setIsCreatingSession(true)}
          />
        </div>

        <div className="lg:col-span-2">
          <SessionDetail
            session={selectedSession}
            taskFilter={taskFilter}
            onTaskFilterChange={setTaskFilter}
            onEditSession={handleEditSession}
            onDuplicateSession={handleDuplicateSession}
            onDeleteSession={handleDeleteSession}
            onArchiveSession={handleArchiveSession}
            onUnarchiveSession={handleUnarchiveSession}
            onAddTask={() => {
              setTaskForm({ name: "", category: "", estimated_completion_time: 30, due_date: "" });
              setIsAddingTask(true);
            }}
            onEditTask={openEditTaskDialog}
            onDeleteTask={handleDeleteTask}
            onArchiveTask={handleArchiveTask}
            onUnarchiveTask={handleUnarchiveTask}
            onToggleTaskComplete={handleToggleComplete}
            onTaskDragEnd={handleDragEnd}
            onMoveCompletedTasksToBottom={handleMoveCompletedToBottom}
          />
        </div>
      </div>

      {/* DIALOGS - Rendered at root level to avoid re-mounting */}
      
      {/* Create Session Dialog */}
      <Dialog open={isCreatingSession} onOpenChange={setIsCreatingSession}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md sm:max-w-[425px] mx-4 sm:mx-auto p-4 sm:p-6">
          <DialogHeader className="space-y-2 sm:space-y-3">
            <DialogTitle className="text-base sm:text-lg">Create New Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
             {/* Note: I am inline-rendering form fields here for simplicity, but could extract to SessionForm component */}
            <div>
              <Label htmlFor="newName" className="text-sm">Session Name</Label>
              <Input
                id="newName"
                value={sessionForm.name}
                onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                placeholder="Enter session name"
                className="text-sm mt-1"
              />
            </div>
            <div>
              <Label htmlFor="newDescription" className="text-sm">Description</Label>
              <Textarea
                id="newDescription"
                value={sessionForm.description}
                onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
                placeholder="Enter session description"
                className="text-sm mt-1 min-h-[60px] sm:min-h-[80px]"
                rows={2}
              />
            </div>
            {/* Duration inputs */}
             <div className="grid grid-cols-2 gap-2 sm:gap-3">
               <div>
                 <Label className="text-sm">Focus (min)</Label>
                 <Input type="number" value={sessionForm.focus_duration} onChange={e => setSessionForm({...sessionForm, focus_duration: parseInt(e.target.value)||0})} className="text-sm mt-1" />
               </div>
               <div>
                 <Label className="text-sm">Short Break</Label>
                 <Input type="number" value={sessionForm.short_break_duration} onChange={e => setSessionForm({...sessionForm, short_break_duration: parseInt(e.target.value)||0})} className="text-sm mt-1" />
               </div>
               <div>
                  <Label className="text-sm">Long Break</Label>
                  <Input type="number" value={sessionForm.long_break_duration} onChange={e => setSessionForm({...sessionForm, long_break_duration: parseInt(e.target.value)||0})} className="text-sm mt-1" />
               </div>
               <div>
                  <Label className="text-sm">Cycles</Label>
                  <Input type="number" value={sessionForm.long_break_per_pomodoros} onChange={e => setSessionForm({...sessionForm, long_break_per_pomodoros: parseInt(e.target.value)||0})} className="text-sm mt-1" />
               </div>
             </div>
             
             <div className="flex flex-col sm:flex-row gap-2 pt-2 sm:pt-3">
                <Button onClick={handleCreateSession} className="flex-1">Create Session</Button>
                <Button variant="outline" onClick={() => setIsCreatingSession(false)} className="flex-1">Cancel</Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={isEditingSession} onOpenChange={setIsEditingSession}>
        <DialogContent className="max-w-xs sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
          </DialogHeader>
           <div className="space-y-4 mt-4">
              <div>
                <Label>Name</Label>
                <Input value={sessionForm.name} onChange={e => setSessionForm({...sessionForm, name: e.target.value})} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={sessionForm.description} onChange={e => setSessionForm({...sessionForm, description: e.target.value})} />
              </div>
               <div className="grid grid-cols-2 gap-4">
                 <div><Label>Focus</Label><Input type="number" value={sessionForm.focus_duration} onChange={e => setSessionForm({...sessionForm, focus_duration: parseInt(e.target.value)||0})}/></div>
                 <div><Label>Short</Label><Input type="number" value={sessionForm.short_break_duration} onChange={e => setSessionForm({...sessionForm, short_break_duration: parseInt(e.target.value)||0})}/></div>
                 <div><Label>Long</Label><Input type="number" value={sessionForm.long_break_duration} onChange={e => setSessionForm({...sessionForm, long_break_duration: parseInt(e.target.value)||0})}/></div>
                 <div><Label>Cycles</Label><Input type="number" value={sessionForm.long_break_per_pomodoros} onChange={e => setSessionForm({...sessionForm, long_break_per_pomodoros: parseInt(e.target.value)||0})}/></div>
               </div>
               <div className="flex gap-2">
                 <Button onClick={handleSaveSession} className="flex-1">Save</Button>
                 <Button variant="outline" onClick={() => setIsEditingSession(false)} className="flex-1">Cancel</Button>
               </div>
           </div>
        </DialogContent>
      </Dialog>
      
      {/* Add Task Dialog */}
      <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
         <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add New Task</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div><Label>Name</Label><Input value={taskForm.name} onChange={e => setTaskForm({...taskForm, name: e.target.value})} /></div>
              <div><Label>Category</Label><Input value={taskForm.category} onChange={e => setTaskForm({...taskForm, category: e.target.value})} /></div>
              <div><Label>Due Date</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} /></div>
              <div><Label>Estimated (min)</Label><Input type="number" value={taskForm.estimated_completion_time} onChange={e => setTaskForm({...taskForm, estimated_completion_time: parseInt(e.target.value)||0})} /></div>
              <div className="flex gap-2">
                <Button onClick={handleAddTask} className="flex-1">Add Task</Button>
                <Button variant="outline" onClick={() => setIsAddingTask(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
         </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={isEditingTask} onOpenChange={setIsEditingTask}>
         <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
             <div className="space-y-4 mt-4">
              <div><Label>Name</Label><Input value={taskForm.name} onChange={e => setTaskForm({...taskForm, name: e.target.value})} /></div>
              <div><Label>Category</Label><Input value={taskForm.category} onChange={e => setTaskForm({...taskForm, category: e.target.value})} /></div>
              <div><Label>Due Date</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} /></div>
              <div><Label>Estimated (min)</Label><Input type="number" value={taskForm.estimated_completion_time} onChange={e => setTaskForm({...taskForm, estimated_completion_time: parseInt(e.target.value)||0})} /></div>
              <div className="flex gap-2">
                <Button onClick={handleSaveTask} className="flex-1">Save</Button>
                <Button variant="outline" onClick={() => setIsEditingTask(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
         </DialogContent>
      </Dialog>

    </main>
  );
}
