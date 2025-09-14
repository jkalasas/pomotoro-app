import { zodResolver } from "@hookform/resolvers/zod";
import type { ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Form, FormField, FormItem, FormLabel } from "~/components/ui/form";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import type { FormEventTrigger, FormOnSubmitEvent } from "~/types/form";

export const sessionInfoSchema = z.object({
  projectDetails: z.string().nonempty(),
});

export type SessionInfoSchema = z.infer<typeof sessionInfoSchema>;

interface Props {
  className?: string;
  disabled?: boolean;
  onSubmit?: (data: FormOnSubmitEvent<SessionInfoSchema>) => void;
}

export function SessionInfoForm(props: Props) {
  const form = useForm<SessionInfoSchema>({
    disabled: props.disabled,
    resolver: zodResolver(sessionInfoSchema),
  });

  return (
    <Form {...form}>
      <form
        {...props}
        onSubmit={form.handleSubmit((data) => props.onSubmit?.({ data, form }))}
        className={cn("space-y-4 p-1", props.className)}
      >
        <FormField
          control={form.control}
          name="projectDetails"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm sm:text-base">Project Details</FormLabel>
              <Textarea 
                {...field} 
                placeholder="Describe your project, goals, and any specific requirements..."
                rows={4}
                className="text-sm sm:text-base"
              />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full text-sm sm:text-base py-2 sm:py-3" disabled={props.disabled}>
          Submit
        </Button>
      </form>
    </Form>
  );
}
