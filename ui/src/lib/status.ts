import type { Task, TaskStatus } from "../types";

export const TASK_COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: "inbox", label: "Inbox" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const grouped: Record<TaskStatus, Task[]> = {
    inbox: [],
    in_progress: [],
    review: [],
    done: [],
  };
  for (const task of tasks) {
    if (task.status in grouped) {
      grouped[task.status].push(task);
    }
  }
  return grouped;
}

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  inbox: ["in_progress"],
  in_progress: ["review", "done", "inbox"],
  review: ["done", "in_progress"],
  done: ["in_progress"],
};

export function upsertTask(tasks: Task[], next: Task): Task[] {
  const found = tasks.some((task) => task.id === next.id);
  if (!found) {
    return [next, ...tasks];
  }
  return tasks.map((task) => (task.id === next.id ? next : task));
}
