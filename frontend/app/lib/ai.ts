import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import type { Session } from "~/types/session";
import { TaskDifficulty } from "~/types/task";

const GEMINI_API_KEY = import.meta.env.TAURI_ENV_GEMINI_API_KEY ?? "";

const tasksSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string(),
      description: z.string().describe("Task description").optional(),
      difficulty: z.nativeEnum(TaskDifficulty),
      pomodoros: z.number().describe("Number of pomodoros"),
      subtasks: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            difficulty: z.nativeEnum(TaskDifficulty),
            pomodoros: z.number().describe("Number of pomodoros"),
          })
        )
        .optional(),
    })
  ),
  pomodoroSetup: z.object({
    duration: z.number(),
    pomodorosBeforeLongBreak: z.number(),
    shortBreakTime: z.number(),
    longBreakTime: z.number(),
  }),
  sessionDetails: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

const TASKS_GENERATION_PROMPT = `
  You are a productivity assistant that helps users generate tasks and pomodoro setups.
  Generate a list of tasks and a pomodoro setup for a productivity app based on the user input. 
  Make sure the tasks are well-defined and actionable.
  Break down larger tasks into smaller subtasks if necessary.
  Make sure to be realistic on the number of pomodoros needed for each task it doesn't matter if it takes a lot of time.
`;

const TASKS_THOUGHTS_PROMPT = `
  You are a productivity assistant that helps users generate tasks and pomodoro setups.
  Your task later is to generate a list of tasks and a pomodoro setup for a productivity app based on the user input.
  Right now your task is to think step by step on how to achieve the goal the user has provided.
`;

const TASKS_REFINEMENT_PROMPT = `
  You are a productivity assistant that helps users generate tasks and pomodoro setups.
  Your task is to refine the tasks and pomodoro setup based on the user input.
  These are the current tasks and pomodoro setup:
`;

const REFINE_SESSION_PROMPT = `
  Refine the given goal the user has provided. Don't give any extra information or ask questions.
  The information will be used to generate a list of tasks and a pomodoro setup.
`;

const gemini2FlashModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  apiKey: GEMINI_API_KEY,
  maxOutputTokens: 8192,
});

const gemini25FlashModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-preview-04-17",
  apiKey: GEMINI_API_KEY,
  maxOutputTokens: 65536,
});

export async function refineSessionPrompt(prompt: string) {
  const messages = [
    new SystemMessage(REFINE_SESSION_PROMPT),
    new HumanMessage(prompt),
  ];

  return (await gemini2FlashModel.invoke(messages)).content.toString();
}

export async function generateTasksThoughts(prompt: string) {
  const messages = [
    new SystemMessage(TASKS_THOUGHTS_PROMPT),
    new HumanMessage(prompt),
  ];

  return (await gemini25FlashModel.invoke(messages)).content.toString();
}

export async function generateTasks(prompt: string): Promise<Session> {
  const thoughts = await generateTasksThoughts(prompt);
  const model = gemini25FlashModel.withStructuredOutput(tasksSchema);

  const messages = [
    new SystemMessage(TASKS_GENERATION_PROMPT),
    new AIMessage(
      "Use the following information to generate tasks and a pomodoro setup."
    ),
    new AIMessage(thoughts),
  ];

  const result = await model.invoke(messages);

  const tasks = result.tasks.reduce((tasks, task) => {
    return [
      ...tasks,
      {
        ...task,
        id: Math.random().toString(36).slice(2),
        subtasks: task.subtasks?.map((subtask) => ({
          ...subtask,
          id: Math.random().toString(36).slice(2),
        })),
      },
    ];
  }, [] as Session["tasks"]);

  return { ...result, tasks };
}

export async function refineSession(session: Session, prompt: string) {
  const model = gemini25FlashModel.withStructuredOutput(tasksSchema);

  const messages = [
    new SystemMessage(TASKS_REFINEMENT_PROMPT),
    new AIMessage("```json\n" + JSON.stringify(session) + "\n```"),
    new AIMessage(prompt),
  ];

  const result = await model.invoke(messages);

  const refinedTasks = result.tasks.reduce((tasks, task) => {
    return [
      ...tasks,
      {
        ...task,
        id: Math.random().toString(36).slice(2),
        subtasks: task.subtasks?.map((subtask) => ({
          ...subtask,
          id: Math.random().toString(36).slice(2),
        })),
      },
    ];
  }, [] as Session["tasks"]);

  return { ...result, tasks: refinedTasks };
}
