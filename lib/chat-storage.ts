/**
 * lib/chat-storage.ts
 *
 * Persistent chat thread storage.
 * Stores up to 15 threads in localStorage as JSON.
 * Each thread: { id, title, messages[], lang, createdAt, updatedAt }
 */

import type { ChatMessage } from '@/hooks/useChat';

const STORAGE_KEY = 'hujjah-chat-threads-v1';
const MAX_THREADS = 15;

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  lang: string;
  createdAt: number;
  updatedAt: number;
}

function getStored(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStored(threads: ChatThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // Storage full — ignore
  }
}

/** Get all threads sorted by most recent. */
export function getAllThreads(): ChatThread[] {
  return getStored().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Get a single thread by ID. */
export function getThread(id: string): ChatThread | undefined {
  return getStored().find((t) => t.id === id);
}

/** Create or update a thread. Evicts oldest if > MAX_THREADS. */
export function saveThread(thread: ChatThread): void {
  const threads = getStored().filter((t) => t.id !== thread.id);
  threads.unshift(thread);
  if (threads.length > MAX_THREADS) {
    threads.pop(); // remove oldest
  }
  setStored(threads);
}

/** Delete a thread by ID. */
export function deleteThread(id: string): void {
  setStored(getStored().filter((t) => t.id !== id));
}

/** Auto-generate a title from the first user message. */
export function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const text = firstUser.text.trim();
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

/** Clear all chat history. */
export function clearAllThreads(): void {
  localStorage.removeItem(STORAGE_KEY);
}
