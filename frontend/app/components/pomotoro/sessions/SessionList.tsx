import { memo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Target, Plus } from "lucide-react";
import type { Session } from "~/stores/tasks";
import { SessionCard } from "./SessionCard";

interface SessionListProps {
  sessions: Session[];
  selectedSessionId: number | undefined;
  showCompleted: boolean;
  showArchived: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onToggleCompleted: () => void;
  onToggleArchived: () => void;
  onSelectSession: (id: number) => void;
  onCreateSession: () => void;
}

export const SessionList = memo(function SessionList({
  sessions,
  selectedSessionId,
  showCompleted,
  showArchived,
  searchQuery,
  onSearchChange,
  onToggleCompleted,
  onToggleArchived,
  onSelectSession,
  onCreateSession,
}: SessionListProps) {
  return (
    <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/50 p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-start justify-between">
            <CardTitle className="text-lg sm:text-xl">Your Sessions</CardTitle>
            <div className="flex flex-col items-start gap-2 w-full">
              <div className="text-sm text-muted-foreground">
                {sessions.length}{" "}
                {sessions.length === 1 ? "session" : "sessions"}
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  variant={showCompleted ? "default" : "outline"}
                  size="sm"
                  onClick={onToggleCompleted}
                  className="text-xs sm:text-sm px-2 sm:px-3 flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">
                    {showCompleted ? "Hide Completed" : "Completed"}
                  </span>
                  <span className="sm:hidden">
                    {showCompleted ? "Hide Completed" : "Completed"}
                  </span>
                </Button>
                <Button
                  variant={showArchived ? "default" : "outline"}
                  size="sm"
                  onClick={onToggleArchived}
                  className="text-xs sm:text-sm px-2 sm:px-3 flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">
                    {showArchived ? "Archived" : "Archive"}
                  </span>
                  <span className="sm:hidden">
                    {showArchived ? "Archived" : "Archive"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 sm:h-9 text-sm sm:text-base"
          />
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isSelected={selectedSessionId === session.id}
              onSelect={onSelectSession}
            />
          ))}

          {sessions.length === 0 && (
            <div className="text-center text-muted-foreground py-6 sm:py-8">
              <Target className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <div className="text-sm sm:text-base">No sessions found</div>
              <Button
                variant="outline"
                className="mt-3 sm:mt-4 text-sm sm:text-base"
                onClick={onCreateSession}
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">
                  Create your first session
                </span>
                <span className="sm:hidden">Create session</span>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
