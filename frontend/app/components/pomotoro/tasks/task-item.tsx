import { useId, useMemo, useState } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import type { Task } from "~/types/task";

interface Props {
  isDoneValue?: boolean;
  isDoneChange?: (isDone: boolean, task: Task) => void;
  task: Task;
}

export function TaskItem({ isDoneValue, isDoneChange, task }: Props) {
  const [isDone, setIsDone] = useState(isDoneValue || false);

  const isDoneMemo = useMemo(
    () => isDoneValue || isDone,
    [isDoneValue, isDone]
  );
  const isDoneSetter = (isDone: boolean) =>
    isDoneChange ? isDoneChange(isDone, task) : setIsDone(isDone);

  return (
    <>
      <div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id={task.id}
            checked={isDoneMemo}
            onCheckedChange={(e: boolean) => isDoneSetter(e)}
          />
          <Label
            htmlFor={task.id}
            className={cn(isDoneMemo && ["line-through", "text-muted-foreground"])}
          >
            {task.name} ({task.pomodoros})
          </Label>
        </div>
        {task.description && (
          <p className="text-sm text-muted-foreground ml-6">{task.description}</p>
        )}
      </div>
      {task.subtasks && task.subtasks.length > 0 && (
        <div className="flex flex-col gap-2 ml-3">
          {task.subtasks.map((subtask, index) => (
            <TaskItem key={index} task={subtask} isDoneValue={isDone} />
          ))}
        </div>
      )}
    </>
  );
}
