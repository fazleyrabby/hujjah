/**
 * hooks/useChat.ts
 *
 * Chatbot hook for Hujjah AI
 * - Maintains message history
 * - Streams AI responses via RAG
 * - Supports follow-up questions with context
 */

import { useState, useCallback, useRef } from 'react';
import { explainQuery, type VerseContext, type HadithContext } from '@/lib/ai/explain';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  lang?: string;               // language this response was generated in
  altText?: string;            // cached translation in the other language
  altLang?: string;            // which language altText is in
  verses?: VerseContext[];
  hadith?: HadithContext[];
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
        lang,
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
  }, []);

  /**
   * Toggle the language of a specific assistant message.
   * Uses cached altText if available; otherwise calls explainQuery again.
   */
  const translateMessage = useCallback(async (msgId: string, targetLang: string) => {
    setState((prev) => {
      const msg = prev.messages.find((m) => m.id === msgId);
      if (!msg || msg.role !== 'assistant') return prev;

      // Already have the cached translation — swap immediately
      if (msg.altLang === targetLang && msg.altText) {
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === msgId
              ? { ...m, text: msg.altText!, lang: targetLang, altText: m.text, altLang: m.lang }
              : m
          ),
        };
      }
      return prev;
    });

    // Need to fetch — find the original user message before this assistant message
    const msgs = state.messages;
    const idx = msgs.findIndex((m) => m.id === msgId);
    if (idx < 1) return;
    const userMsg = msgs[idx - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    // Check if already cached after state update
    const current = msgs[idx];
    if (current?.altLang === targetLang && current.altText) return;

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await explainQuery(userMsg.text, targetLang);
      setState((prev) => ({
        ...prev,
        loading: false,
        messages: prev.messages.map((m) =>
          m.id === msgId
            ? {
                ...m,
                text: result.explanation,
                lang: targetLang,
                altText: m.text,
                altLang: m.lang,
                verses: result.verses.length > 0 ? result.verses : m.verses,
                hadith: result.hadith.length > 0 ? result.hadith : m.hadith,
              }
            : m
        ),
      }));
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [state.messages]);

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
    translateMessage,
    clearChat,
  };
}
