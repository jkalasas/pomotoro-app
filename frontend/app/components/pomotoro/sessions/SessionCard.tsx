import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Clock } from "lucide-react";
import type { Session } from "~/stores/tasks";

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  onSelect: (id: number) => void;
}

export const SessionCard = memo(function SessionCard({
  session,
  isSelected,
  onSelect,
}: SessionCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
        isSelected ? "border-primary bg-primary/10" : ""
      }`}
      onClick={() => onSelect(session.id)}
    >
      <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4">
        <CardTitle className="text-base sm:text-lg">{session.name}</CardTitle>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {session.description}
        </p>
      </CardHeader>
      <CardContent className="pt-0 p-3 sm:p-4 sm:pt-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{session.focus_duration}m focus</span>
          {session.completed && (
            <Badge variant="secondary" className="ml-auto text-xs">
              Completed
            </Badge>
          )}
          {session.archived && (
            <Badge variant="outline" className="ml-auto text-xs">
              Archived
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
