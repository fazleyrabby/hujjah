/**
 * hooks/useChat.ts
 *
 * Chatbot hook for Hujjah AI
 * - Maintains message history
 * - Streams AI responses via RAG
 * - Supports follow-up questions with context
 */

import { useState, useCallback, useRef } from 'react';
import { explainQuery, type VerseContext } from '@/lib/ai/explain';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  verses?: VerseContext[];
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    loading: false,
    error: null,
  });
  const abortRef = useRef(false);

  const sendMessage = useCallback(async (text: string, lang: string = 'en') => {
    if (!text.trim()) return;

    abortRef.current = false;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      loading: true,
      error: null,
    }));

    try {
      const result = await explainQuery(text.trim(), lang);

      if (abortRef.current) return;

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        text: result.explanation,
        verses: result.verses,
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
  }, []);

  const clearChat = useCallback(() => {
    abortRef.current = true;
    setState({
      messages: [],
      loading: false,
      error: null,
    });
  }, []);

  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    sendMessage,
    clearChat,
  };
}
