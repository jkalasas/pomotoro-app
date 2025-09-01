import * as React from "react";
import { Button } from "~/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

export interface DayInfo {
  id: string;
  shortName: string;
  dayOfMonth: number;
  date: Date;
}

interface DateNavigatorProps {
  days: DayInfo[];
  selectedDayId: string | null;
  onDateSelect: (dayId: string) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
}

export function DateNavigator({
  days,
  selectedDayId,
  onDateSelect,
  onNavigateBack,
  onNavigateForward,
}: DateNavigatorProps) {
  return (
    <div className="flex items-center justify-center space-x-1 mb-4">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={onNavigateBack}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-5 w-5 text-muted-foreground" />
      </Button>
      {days.map((day) => (
        <Button
          key={day.id}
          variant={day.id === selectedDayId ? "default" : "ghost"}
          className={cn(
            "flex flex-col items-center justify-center h-14 w-14 rounded-md p-1 text-xs font-medium",
            day.id === selectedDayId
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-foreground hover:bg-accent"
          )}
          onClick={() => onDateSelect(day.id)}
        >
          <span>{day.shortName}</span>
          <span className="text-lg font-bold">{day.dayOfMonth}</span>
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={onNavigateForward}
        aria-label="Next week"
      >
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </Button>
    </div>
  );
}
