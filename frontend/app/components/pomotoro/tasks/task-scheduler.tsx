// components/TaskScheduler.tsx
import * as React from "react";
import {
  format,
  startOfWeek,
  addDays,
  getDate,
  subWeeks,
  addWeeks,
  parseISO,
} from "date-fns";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";
import { DateNavigator, type DayInfo } from "./date-navigator";
import { TimelineView, type Task } from "./timeline-view"; // Task interface needed for sorting

// --- Constants ---
const DATE_FORMAT = "yyyy-MM-dd";
const DEFAULT_HOUR_HEIGHT = 60; // Use a constant for hour height
const DEFAULT_SCROLL_HOUR = 8; // Scroll to 8 AM by default

// --- Helpers (getWeekDates remains the same) ---
const getWeekDates = (refDate: Date): DayInfo[] => {
  const weekStartsOn = 0; // Sunday
  const startDate = startOfWeek(refDate, { weekStartsOn });
  const days: DayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const currentDate = addDays(startDate, i);
    days.push({
      id: format(currentDate, DATE_FORMAT),
      shortName: format(currentDate, "EEE").toUpperCase(),
      dayOfMonth: getDate(currentDate),
      date: currentDate,
    });
  }
  return days;
};

// Helper to convert HH:MM to minutes from midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// --- Example Data (remains the same, ensure keys are yyyy-MM-dd) ---
const allTasks: { [date: string]: Task[] } = {
  "2023-11-19": [
    {
      id: "t0",
      title: "Early Bird",
      startTime: "01:15",
      durationMinutes: 45,
      color: "#9333ea",
    },
  ],
  "2023-11-20": [
    {
      id: "t1",
      title: "Meeting",
      startTime: "11:00",
      durationMinutes: 60,
      color: "#3b82f6",
    },
  ],
  "2023-11-21": [],
  "2023-11-22": [
    {
      id: "t10",
      title: "Late Finish",
      startTime: "22:30",
      durationMinutes: 90,
      color: "#78716c",
    },
  ], // Ends after midnight
  "2023-11-23": [
    {
      id: "t2",
      title: "Debugging",
      startTime: "09:30",
      durationMinutes: 27,
      color: "#a16207",
    },
    {
      id: "t3",
      title: "Code Review",
      startTime: "14:00",
      durationMinutes: 90,
      color: "#16a34a",
    },
    { id: "t4", title: "Short call", startTime: "10:15", durationMinutes: 5 },
  ],
  "2023-11-24": [],
  "2023-11-25": [
    { id: "t5", title: "Planning", startTime: "16:30", durationMinutes: 120 },
  ],
};

// --- Component ---
export function TaskScheduler() {
  const [referenceDate, setReferenceDate] = React.useState(
    new Date(2023, 10, 23)
  );
  const [selectedDayId, setSelectedDayId] = React.useState<string | null>(
    format(referenceDate, DATE_FORMAT)
  );

  // Ref for the scrollable container
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const currentWeekDays = React.useMemo(
    () => getWeekDates(referenceDate),
    [referenceDate]
  );

  // Get and sort tasks for the selected day
  const currentTasks = React.useMemo(() => {
    const tasks = selectedDayId ? allTasks[selectedDayId] || [] : [];
    // Sort tasks by start time to easily find the first one
    return tasks.sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
  }, [selectedDayId]);

  const handleDateSelect = (dayId: string) => {
    setSelectedDayId(dayId);
  };

  const handleNavigateBack = () => {
    setReferenceDate((prevDate) => subWeeks(prevDate, 1));
    setSelectedDayId(null);
  };

  const handleNavigateForward = () => {
    setReferenceDate((prevDate) => addWeeks(prevDate, 1));
    setSelectedDayId(null);
  };

  const handleAddTask = () => {
    if (!selectedDayId) return;
    alert(`Add New Task button clicked! (for selected date: ${selectedDayId})`);
    // Implement task addition logic here
  };

  // Effect to scroll the timeline when the selected day changes
  React.useEffect(() => {
    if (scrollContainerRef.current && selectedDayId) {
      let targetScrollTop =
        DEFAULT_SCROLL_HOUR * DEFAULT_HOUR_HEIGHT - DEFAULT_HOUR_HEIGHT / 2; // Default scroll position (center 8 AM)

      if (currentTasks.length > 0) {
        // Scroll to the first task of the day
        const firstTaskStartMinutes = timeToMinutes(currentTasks[0].startTime);
        // Calculate scroll position to show the task slightly below the top edge
        targetScrollTop =
          (firstTaskStartMinutes / 60) * DEFAULT_HOUR_HEIGHT -
          DEFAULT_HOUR_HEIGHT / 2; // Center the start time visually
      }

      // Ensure scroll is within bounds
      targetScrollTop = Math.max(0, targetScrollTop);

      // Use smooth scrolling for better UX
      scrollContainerRef.current.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });
    } else if (scrollContainerRef.current) {
      // If no day selected or no tasks, scroll to default
      let targetScrollTop =
        DEFAULT_SCROLL_HOUR * DEFAULT_HOUR_HEIGHT - DEFAULT_HOUR_HEIGHT / 2;
      scrollContainerRef.current.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });
    }
  }, [selectedDayId, currentTasks]); // Rerun effect when selected day or tasks change

  return (
    <div className="h-full p-4 flex flex-col grow">
      <div className="shrink-0">
        <DateNavigator
          days={currentWeekDays}
          selectedDayId={selectedDayId}
          onDateSelect={handleDateSelect}
          onNavigateBack={handleNavigateBack}
          onNavigateForward={handleNavigateForward}
        />
      </div>
      {/* Scrollable Container for the Timeline */}
      <div
        ref={scrollContainerRef}
        className="grow overflow-y-auto border border-transparent -mx-4 px-4" // Grow to fill space, enable scroll, add padding compensation for negative margin
        style={{ willChange: "scroll-position" }} // Hint for performance
      >
        {selectedDayId ? (
          <TimelineView
            tasks={currentTasks}
            hourHeight={DEFAULT_HOUR_HEIGHT} // Pass the hour height
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a day to view tasks.
          </div>
        )}
      </div>
    </div>
  );
}
