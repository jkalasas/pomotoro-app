// components/TimelineView.tsx
import * as React from "react";
import { format } from "date-fns"; // Import format for potential future use

// Task interface remains the same
export interface Task {
  id: string;
  title: string;
  startTime: string; // e.g., "09:30"
  durationMinutes: number; // e.g., 30
  color?: string; // Optional: Allow different task colors
}

interface TimelineViewProps {
  tasks: Task[];
  hourHeight?: number; // Height allocated for each hour slot in pixels
  // Removed startHour and endHour props
}

// Helper Function (remains the same)
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function TimelineView({
  tasks,
  hourHeight = 60, // Default hour height
}: TimelineViewProps) {
  // Generate hours 0 through 23
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const totalTimelineMinutes = 24 * 60;
  const totalTimelineHeight = 24 * hourHeight;

  // Add a ref for the timeline container
  const timelineRef = React.useRef<HTMLDivElement>(null);

  // Helper function to get current time in minutes since midnight
  const getCurrentTimeInMinutes = (): number => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };

  // Calculate task position and height based on 24-hour day
  const getTaskStyle = (task: Task): React.CSSProperties => {
    const startMinutes = timeToMinutes(task.startTime);
    // Position is now based on minutes from midnight (00:00)
    const topPosition = (startMinutes / 60) * hourHeight;
    const taskHeight = (task.durationMinutes / 60) * hourHeight;

    // Calculate the maximum possible height within the 24-hour bounds
    const maxPossibleMinutes = totalTimelineMinutes - startMinutes;
    const maxPossibleHeight = (maxPossibleMinutes / 60) * hourHeight;

    return {
      top: `${topPosition}px`,
      height: `${Math.max(0, Math.min(taskHeight, maxPossibleHeight))}px`, // Ensure height is not negative and doesn't overflow 24h mark
      backgroundColor: task.color || "hsl(var(--primary))", // Use primary color or task-specific color
      position: "absolute", // Ensure position is absolute
      left: "0.25rem", // left-1
      right: "0.25rem", // right-1
      zIndex: 10, // Ensure tasks are above lines
    };
  };

  // Auto-scroll to the current time or the first task when component mounts or tasks change
  React.useEffect(() => {
    if (timelineRef.current) {
      let scrollPosition: number;
      
      if (tasks.length > 0) {
        // Sort tasks by start time
        const sortedTasks = [...tasks].sort((a, b) => {
          return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        });

        const firstTaskStartMinutes = timeToMinutes(sortedTasks[0].startTime);
        scrollPosition = (firstTaskStartMinutes / 60) * hourHeight;
      } else {
        // No tasks - scroll to current time
        const currentMinutes = getCurrentTimeInMinutes();
        scrollPosition = (currentMinutes / 60) * hourHeight;
      }

      // Scroll to position with some offset to show a bit of time before
      const offset = hourHeight; // Show 1 hour before
      timelineRef.current.scrollTop = Math.max(0, scrollPosition - offset);
    }
  }, [tasks, hourHeight]);

  return (
    // The flex container now represents the *entire* 24-hour day height internally
    <div
      className="relative flex overflow-y-auto"
      style={{ height: `${totalTimelineHeight}px` }}
      ref={timelineRef}
    >
      {/* Time Column */}
      <div className="w-16 pr-2 flex flex-col items-end text-xs text-muted-foreground shrink-0">
        {hours.map((hour) => (
          <div
            key={hour}
            className="flex items-center justify-end"
            // Each hour label container takes up the full hourHeight
            style={{ height: `${hourHeight}px` }}
          >
            {/* Display time label */}
            {`${String(hour).padStart(2, "0")}:00`}
          </div>
        ))}
      </div>

      {/* Timeline Grid & Tasks Area */}
      <div className="flex-grow relative border-l border-border/50">
        {/* Horizontal Lines - Draw lines at the hour marks for all 24 hours */}
        {hours.map((hour, index) => (
          <div
            key={`line-${hour}`}
            className="absolute w-full border-t border-border/30"
            // Position line exactly at the hour mark
            style={{
              top: `${index * hourHeight}px`,
              height: `${hourHeight}px`,
            }}
          />
        ))}
        {/* Add a final line at the 24:00 mark */}
        <div
          className="absolute w-full border-t border-border/30"
          style={{ top: `${24 * hourHeight}px` }}
        />

        {/* Task Blocks Container - Positioned relative to the grid area */}
        <div className="absolute inset-0">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="p-1 md:p-2 text-white rounded-md shadow overflow-hidden text-xs flex flex-col justify-between"
              // Use default amber color or task specific color
              style={{
                ...getTaskStyle(task),
                backgroundColor: task.color || "#a16207" /* amber-700 */,
              }}
            >
              {/* Conditional rendering based on calculated height */}
              {getTaskStyle(task).height &&
                parseFloat(getTaskStyle(task).height as string) > 35 && (
                  <>
                    <div className="font-medium truncate">{task.title}</div>
                    <div className="opacity-80 text-[10px]">
                      {task.startTime}
                    </div>
                  </>
                )}
              {getTaskStyle(task).height &&
                parseFloat(getTaskStyle(task).height as string) > 15 && (
                  <div className="text-right text-[10px] opacity-90 mt-auto">
                    {task.durationMinutes} min
                  </div>
                )}
              {/* Fallback for very short tasks */}
              {getTaskStyle(task).height &&
                parseFloat(getTaskStyle(task).height as string) <= 15 &&
                parseFloat(getTaskStyle(task).height as string) > 5 && (
                  <div className="font-medium truncate text-[10px] leading-tight">
                    {task.title}
                  </div>
                )}
              {getTaskStyle(task).height &&
                parseFloat(getTaskStyle(task).height as string) <= 5 && (
                  <div className="font-medium truncate text-[8px] leading-tight">
                    {/* Maybe just show color */}
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
