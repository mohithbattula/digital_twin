import { create } from "zustand";

export interface User {
  id: string;
  name: string;
  role: "team_lead" | "team_member";
  avatar_url?: string;
}

export interface Task {
  id: string;
  assigned_to: string;
  title: string;
  description: string;
  scope: "weekly_goal" | "daily_task";
  status: "pending" | "submitted" | "approved" | "rejected" | "flagged";
  submission_notes: string;
  parent_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  progress: number;
  created_at: string;
  updated_at?: string;
  twin_review_status?: "approved" | "rejected" | "needs_clarification" | null;
  twin_review_notes?: string | null;

}

export interface Message {
  id: string;
  session_id: string;
  sender_id: string | null;
  sender_type: "human" | "twin";
  content: string;
  associated_task_id: string | null;
  trace_id?: string;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  users?: { name: string; role: string; avatar_url: string | null };
}

export interface Notification {
  id: string;
  type: "task_submitted" | "task_approved" | "task_rejected" | "comment_added";
  title: string;
  message: string;
  taskId?: string;
  timestamp: string;
  read: boolean;
}

interface AppState {
  // Data
  currentUser: User | null;
  dashboardRole: "student" | "lead";
  tasks: Task[];
  messages: Message[];
  activeSessionId: string | null;
  notifications: Notification[];

  // UI state
  isStreaming: boolean;
  selectedTaskId: string | null;

  // Actions
  setCurrentUser: (user: User | null) => void;
  setDashboardRole: (role: "student" | "lead") => void;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  upsertTask: (task: Task) => void;
  removeTask: (id: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setActiveSessionId: (id: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setSelectedTaskId: (id: string | null) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentUser: null,
  dashboardRole: "student",
  tasks: [],
  messages: [],
  activeSessionId: null,
  isStreaming: false,
  selectedTaskId: null,
  notifications: [],

  // Actions
  setCurrentUser: (user) => set({ currentUser: user }),
  setDashboardRole: (role) => set({ dashboardRole: role }),
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  upsertTask: (task) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const updated = [...state.tasks];
        updated[idx] = { ...updated[idx], ...task };
        return { tasks: updated };
      }
      return { tasks: [task, ...state.tasks] };
    }),
  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    })),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
