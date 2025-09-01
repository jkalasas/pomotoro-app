import { useId, useState } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

interface Props {
  task: string;
}

export default function TaskCheckItem({ task }: Props) {
  const [isDone, setIsDone] = useState(false);
  const id = useId();

  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={isDone}
        onCheckedChange={(e: boolean) => setIsDone(e)}
      />
      <label htmlFor={id} className={cn(isDone && ["line-through", "text-gray-500"])}>{task}</label>
    </div>
  );
}
