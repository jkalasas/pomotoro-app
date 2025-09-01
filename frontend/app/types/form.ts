import type { UseFormReturn } from "react-hook-form";

export interface FormEventTrigger<T extends Record<string, unknown>> {
  data: Partial<T>;
  form: UseFormReturn<T>;
}

export interface FormOnSubmitEvent<T extends Record<string, unknown>>
  extends FormEventTrigger<T> {
  data: T;
}
