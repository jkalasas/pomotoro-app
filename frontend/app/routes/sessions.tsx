import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Plus, Edit, Trash2, GripVertical, Clock, Target } from "lucide-react";
import { useTaskStore, type Session, type Task } from "~/stores/tasks";
import { DragDropContext, Droppable, Draggable, type DropResult, type DroppableProvided, type DraggableProvided, type DraggableStateSnapshot } from "@hello-pangea/dnd";
import { SidebarTrigger } from "~/components/ui/sidebar";

export default function Sessions() {
  const {
    sessions,
    isLoading,
    loadSessions,
    getSession,
    updateSession,
    deleteSession,
    addTaskToSession,
    updateTask,
    deleteTask,
    reorderTasks,
  } = useTaskStore();

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);

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
    loadSessions();
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

  const handleAddTask = async () => {
    if (!selectedSession) return;
    
    try {
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
    try {
      await deleteTask(taskId);
      if (selectedSession) {
        const updatedTasks = selectedSession.tasks?.filter(task => task.id !== taskId);
        setSelectedSession({ ...selectedSession, tasks: updatedTasks });
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !selectedSession?.tasks) return;

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
    <div className="container mx-auto p-6">
      <div className="mb-4">
        <SidebarTrigger />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Sessions</h1>
          </div>
          
          <div className="space-y-4">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedSession?.id === session.id ? "border-primary" : ""
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
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {sessions.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No sessions found
              </div>
            )}
          </div>
        </div>

        {/* Session Details */}
        <div className="lg:col-span-2">
          {selectedSession ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{selectedSession.name}</h2>
                  <p className="text-muted-foreground">{selectedSession.description}</p>
                </div>
                <div className="flex gap-2">
                  <Dialog open={isEditingSession} onOpenChange={setIsEditingSession}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => handleEditSession(selectedSession)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Session
                      </Button>
                    </DialogTrigger>
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
                            onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={sessionForm.description}
                            onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="focus">Focus Duration (min)</Label>
                            <Input
                              id="focus"
                              type="number"
                              value={sessionForm.focus_duration}
                              onChange={(e) => setSessionForm({ ...sessionForm, focus_duration: parseInt(e.target.value) })}
                            />
                          </div>
                          <div>
                            <Label htmlFor="short">Short Break (min)</Label>
                            <Input
                              id="short"
                              type="number"
                              value={sessionForm.short_break_duration}
                              onChange={(e) => setSessionForm({ ...sessionForm, short_break_duration: parseInt(e.target.value) })}
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
                              onChange={(e) => setSessionForm({ ...sessionForm, long_break_duration: parseInt(e.target.value) })}
                            />
                          </div>
                          <div>
                            <Label htmlFor="cycles">Cycles for Long Break</Label>
                            <Input
                              id="cycles"
                              type="number"
                              value={sessionForm.long_break_per_pomodoros}
                              onChange={(e) => setSessionForm({ ...sessionForm, long_break_per_pomodoros: parseInt(e.target.value) })}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button onClick={handleSaveSession} className="flex-1">
                            Save Changes
                          </Button>
                          <Button variant="outline" onClick={() => setIsEditingSession(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => handleDeleteSession(selectedSession.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Session Config */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{selectedSession.focus_duration}m</div>
                    <div className="text-sm text-muted-foreground">Focus Duration</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{selectedSession.short_break_duration}m</div>
                    <div className="text-sm text-muted-foreground">Short Break</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{selectedSession.long_break_duration}m</div>
                    <div className="text-sm text-muted-foreground">Long Break</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{selectedSession.long_break_per_pomodoros}</div>
                    <div className="text-sm text-muted-foreground">Cycles for Long Break</div>
                  </CardContent>
                </Card>
              </div>

              {/* Tasks */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Tasks</h3>
                  <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
                    <DialogTrigger asChild>
                      <Button onClick={() => setIsAddingTask(true)}>
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
                            onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                            placeholder="Enter task name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="category">Category</Label>
                          <Input
                            id="category"
                            value={taskForm.category}
                            onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                            placeholder="Enter category"
                          />
                        </div>
                        <div>
                          <Label htmlFor="duration">Estimated Duration (minutes)</Label>
                          <Input
                            id="duration"
                            type="number"
                            value={taskForm.estimated_completion_time}
                            onChange={(e) => setTaskForm({ ...taskForm, estimated_completion_time: parseInt(e.target.value) })}
                          />
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button onClick={handleAddTask} className="flex-1">
                            Add Task
                          </Button>
                          <Button variant="outline" onClick={() => setIsAddingTask(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="tasks">
                    {(provided: DroppableProvided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                        {selectedSession.tasks?.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                            {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`${snapshot.isDragging ? "shadow-lg" : ""}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div {...provided.dragHandleProps}>
                                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium">{task.name}</h4>
                                        <Badge variant="secondary">{task.category}</Badge>
                                        {task.completed && (
                                          <Badge variant="default">Completed</Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Target className="h-3 w-3" />
                                        <span>{task.estimated_completion_time} minutes</span>
                                        {task.actual_completion_time && (
                                          <span>• Actual: {task.actual_completion_time} minutes</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Dialog open={isEditingTask && editingTask?.id === task.id} onOpenChange={setIsEditingTask}>
                                        <DialogTrigger asChild>
                                          <Button variant="ghost" size="sm" onClick={() => handleEditTask(task)}>
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                          <DialogHeader>
                                            <DialogTitle>Edit Task</DialogTitle>
                                          </DialogHeader>
                                          <div className="space-y-4 mt-6">
                                            <div>
                                              <Label htmlFor="editTaskName">Task Name</Label>
                                              <Input
                                                id="editTaskName"
                                                value={taskForm.name}
                                                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="editCategory">Category</Label>
                                              <Input
                                                id="editCategory"
                                                value={taskForm.category}
                                                onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="editDuration">Estimated Duration (minutes)</Label>
                                              <Input
                                                id="editDuration"
                                                type="number"
                                                value={taskForm.estimated_completion_time}
                                                onChange={(e) => setTaskForm({ ...taskForm, estimated_completion_time: parseInt(e.target.value) })}
                                              />
                                            </div>
                                            <div className="flex gap-2 pt-4">
                                              <Button onClick={handleSaveTask} className="flex-1">
                                                Save Changes
                                              </Button>
                                              <Button variant="outline" onClick={() => setIsEditingTask(false)}>
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
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
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

                {(!selectedSession.tasks || selectedSession.tasks.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    No tasks yet. Add some tasks to get started!
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <div>Select a session to view details</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
