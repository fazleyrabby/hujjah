/**
 * hooks/useChat.ts
 *
 * Chatbot hook for Hujjah AI
 * - Thread-based message history (persistent)
 * - Streams AI responses via RAG
 * - Per-message translation loading state
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { explainQuery, type VerseContext, type HadithContext } from '@/lib/ai/explain';
import {
  getAllThreads,
  getThread,
  saveThread,
  deleteThread,
  generateTitle,
  type ChatThread,
} from '@/lib/chat-storage';

function detectLang(text: string): 'en' | 'bn' | 'ar' {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'ar';
  return 'en';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  lang?: string;
  altText?: string;
  altLang?: string;
  verses?: VerseContext[];
  hadith?: HadithContext[];
  timestamp: number;
  isTranslating?: boolean; // per-message translation loader
}

interface ChatState {
  threadId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  threads: ChatThread[];
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createNewThread(lang: string): ChatThread {
  const id = makeId();
  return {
    id,
    title: 'New Chat',
    messages: [],
    lang,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function useChat(initialThreadId?: string) {
  const [state, setState] = useState<ChatState>(() => {
    const threads = getAllThreads();
    let thread: ChatThread | undefined;

    if (initialThreadId) {
      thread = getThread(initialThreadId);
    }
    if (!thread && threads.length > 0) {
      thread = threads[0];
    }
    if (!thread) {
      thread = createNewThread('en');
    }

    return {
      threadId: thread.id,
      messages: thread.messages,
      loading: false,
      error: null,
      threads,
    };
  });

  const abortRef = useRef(false);

  // Persist thread whenever messages change
  useEffect(() => {
    if (!state.threadId || state.messages.length === 0) return;

    const thread: ChatThread = {
      id: state.threadId,
      title: generateTitle(state.messages),
      messages: state.messages,
      lang: state.messages.find((m) => m.lang)?.lang || 'en',
      createdAt: state.threads.find((t) => t.id === state.threadId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    saveThread(thread);
    setState((prev) => ({
      ...prev,
      threads: getAllThreads(),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages, state.threadId]);

  const loadThread = useCallback((threadId: string) => {
    const thread = getThread(threadId);
    if (thread) {
      setState({
        threadId: thread.id,
        messages: thread.messages,
        loading: false,
        error: null,
        threads: getAllThreads(),
      });
    }
  }, []);

  const createThread = useCallback((lang: string = 'en') => {
    const thread = createNewThread(lang);
    saveThread(thread);
    setState({
      threadId: thread.id,
      messages: [],
      loading: false,
      error: null,
      threads: getAllThreads(),
    });
    return thread.id;
  }, []);

  const removeThread = useCallback((threadId: string) => {
    deleteThread(threadId);
    const remaining = getAllThreads();
    setState((prev) => {
      if (prev.threadId === threadId) {
        const next = remaining[0];
        return {
          threadId: next?.id || null,
          messages: next?.messages || [],
          loading: false,
          error: null,
          threads: remaining,
        };
      }
      return { ...prev, threads: remaining };
    });
  }, []);

  const sendMessage = useCallback(async (text: string, _preferredLang: string = 'en') => {
    if (!text.trim()) return;

    // Auto-detect language from user input — AI replies in the same language
    const detectedLang = detectLang(text.trim());

    // Ensure we have a thread
    let currentThreadId = state.threadId;
    if (!currentThreadId) {
      currentThreadId = createThread(detectedLang);
    }

    abortRef.current = false;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      text: text.trim(),
      lang: detectedLang,
      timestamp: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      threadId: currentThreadId,
      messages: [...prev.messages, userMsg],
      loading: true,
      error: null,
    }));

    try {
      const result = await explainQuery(text.trim(), detectedLang);

      if (abortRef.current) return;

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        text: result.explanation,
        lang: detectedLang,
        verses: result.verses,
        hadith: result.hadith,
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
        loading: false,
      }));
    } catch (err: unknown) {
      if (abortRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  }, [state.threadId, createThread]);

  /**
   * Switch the language of a specific assistant message.
   * Re-runs the RAG pipeline with the original user question in the target language
   * (instead of raw translation) so verses are retrieved in the correct language.
   */
  const translateMessage = useCallback(async (msgId: string, targetLang: string) => {
    const msg = state.messages.find((m) => m.id === msgId);
    if (!msg || msg.role !== 'assistant') return;
    if (msg.lang === targetLang) return;

    // Check cache: did we already generate this answer in the target language?
    if (msg.altLang === targetLang && msg.altText) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === msgId
            ? { ...m, text: m.altText!, lang: targetLang, altText: m.text, altLang: m.lang }
            : m
        ),
      }));
      return;
    }

    // Find the user message that prompted this assistant message
    const idx = state.messages.findIndex((m) => m.id === msgId);
    if (idx < 1) return;
    const userMsg = state.messages[idx - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    // Set per-message translating state
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) =>
        m.id === msgId ? { ...m, isTranslating: true } : m
      ),
    }));

    try {
      // Re-run RAG with the original question in the target language
      const result = await explainQuery(userMsg.text, targetLang);
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === msgId
            ? {
                ...m,
                text: result.explanation,
                lang: targetLang,
                altText: m.text,
                altLang: m.lang,
                verses: result.verses,
                hadith: result.hadith,
                isTranslating: false,
              }
            : m
        ),
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === msgId ? { ...m, isTranslating: false } : m
        ),
      }));
    }
  }, [state.messages]);

  const clearChat = useCallback(() => {
    abortRef.current = true;
    if (state.threadId) {
      deleteThread(state.threadId);
    }
    const threads = getAllThreads();
    const next = threads[0];
    setState({
      threadId: next?.id || null,
      messages: next?.messages || [],
      loading: false,
      error: null,
      threads,
    });
  }, [state.threadId]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return {
    threadId: state.threadId,
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    threads: state.threads,
    sendMessage,
    translateMessage,
    loadThread,
    createThread,
    removeThread,
    clearChat,
    setError,
  };
}
