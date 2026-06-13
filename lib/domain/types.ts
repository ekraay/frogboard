export type TaskKind = "shift" | "frog";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface BoardSignup {
  id: string;
  name: string;
  group: string | null;
}

export interface BoardTask {
  id: string;
  kind: TaskKind;
  title: string;
  category: string | null;
  requestedGroup: string | null;
  neededCount: number;
  date: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  dueBy: Date | null;
  pointOfContact: string | null;
  location: string | null;
  definitionOfDone: string | null;
  position: number;
  status: TaskStatus;
  waiting: boolean;
  signups: BoardSignup[];
}

export interface SlotInfo {
  filled: number;
  needed: number;
  isFull: boolean;
}

export interface DayGroup {
  /** ISO date (YYYY-MM-DD) in the event timezone, or "all-day" for undated tasks */
  key: string;
  label: string;
  tasks: BoardTask[];
}
