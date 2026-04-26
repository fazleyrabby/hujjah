'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import LinkedVerseText from '@/components/LinkedVerseText';
import { clsx } from 'clsx';
import Link from 'next/link';

interface ChatWidgetProps {
  lang: string;
  onNavigateToVerse?: (surah: number, ayah: number) => void;
}

export default function ChatWidget({ lang, onNavigateToVerse }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [showThreads, setShowThreads] = useState(false);

  const {
    messages,
    loading,
    loadingMessage,
    error,
    threads,
    sendMessage,
    translateMessage,
    loadThread,
    createThread,
    removeThread,
    clearChat,
  } = useChat();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Load tiered GGUF model on first chat open
  useEffect(() => {
    if (open && !modelLoaded) {
      console.log('[ChatWidget] Loading GGUF model for chat...');
      import('@/lib/ai/llama').then(({ loadLlamaModel, getTieredModelPath }) => {
        getTieredModelPath().then((path) => {
          loadLlamaModel(path)
            .then(() => {
              console.log('[ChatWidget] Model loaded successfully:', path);
              setModelLoaded(true);
            })
            .catch((err) => {
              console.warn('[ChatWidget] Model load failed:', err);
              setModelLoaded(true);
            });
        });
      }).catch(console.error);
    }
  }, [open, modelLoaded]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setShowThreads(false);
    await sendMessage(text, lang);
    inputRef.current?.focus();
  };

  const handleNavigateToVerse = (surah: number, ayah: number) => {
    setOpen(false);
    onNavigateToVerse?.(surah, ayah);
  };

  const handleNewChat = () => {
    createThread(lang);
    setShowThreads(false);
  };

  const isBn = lang === 'bn';
  const isAr = lang === 'ar';

  const t = {
    title: isBn ? 'হুজ্জাহ এআই' : isAr ? 'هجة AI' : 'Hujjah AI',
    offline: isBn ? 'স্থানীয় মডেল · ১০০% অফলাইন' : isAr ? 'نموذج محلي · ١٠٠٪ بدون إنترنت' : 'Local model · 100% offline',
    clear: isBn ? 'চ্যাট মুছুন' : isAr ? 'مسح الدردشة' : 'Clear chat',
    collapse: isBn ? 'ছোট করুন' : isAr ? 'طوي' : 'Collapse',
    expand: isBn ? 'বড় করুন' : isAr ? 'توسيع' : 'Expand',
    askPrompt: isBn ? 'কুরআন ও হাদিস সম্পর্কে জিজ্ঞাসা করুন' : isAr ? 'اسأل عن القرآن والحديث' : 'Ask about Quran & Hadith',
    example: isBn ? 'যেমন: "সালাত সম্পর্কে ব্যাখ্যা করুন"' : isAr ? 'مثال: "اشرح مفهوم التوبة"' : 'e.g., "explain the concept of tawbah"',
    loadingModel: isBn ? '🧠 লোকাল মডেল লোড হচ্ছে...' : isAr ? '🧠 جاري تحميل النموذج المحلي...' : '🧠 Loading local model...',
    sources: isBn ? 'সূত্র' : isAr ? 'المصادر' : 'Sources',
    placeholder: isBn ? 'এখানে লিখুন...' : isAr ? 'اكتب سؤالك هنا...' : 'Type your question...',
    chat: isBn ? 'এআই চ্যাট' : isAr ? 'دردشة AI' : 'AI Chat',
    recentChats: isBn ? 'সাম্প্রতিক চ্যাট' : isAr ? 'المحادثات الأخيرة' : 'Recent chats',
    newChat: isBn ? 'নতুন চ্যাট' : isAr ? 'محادثة جديدة' : 'New chat',
    openFull: isBn ? 'পূর্ণ স্ক্রিন' : isAr ? 'شاشة كاملة' : 'Full screen',
    translating: isBn ? 'অনুবাদ হচ্ছে...' : isAr ? 'جاري الترجمة...' : 'Translating...',
  };

  // Recent chats preview (max 3)
  const recentThreads = threads.slice(0, 3);

  return (
    <>
      {/* Floating Toggle Button */}
      {!open && (
        <div className="fixed bottom-[72px] right-6 z-[60]">
          <button
            onClick={() => setOpen(true)}
            className="relative w-12 h-12 bg-teal-600 hover:bg-teal-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
            title={t.chat}
          >
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {threads.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {threads.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed z-[60] bg-white dark:bg-zinc-900 shadow-2xl border border-gray-200 dark:border-zinc-700 flex flex-col overflow-hidden animate-fade-in bottom-[72px] right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-7rem)] rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-teal-50 dark:bg-teal-900/20 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t.title}</h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{t.offline}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Thread list toggle */}
              <button
                onClick={() => setShowThreads((s) => !s)}
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                title={t.recentChats}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* New chat */}
              <button
                onClick={handleNewChat}
                className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-md transition-colors"
                title={t.newChat}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {/* Full screen */}
              <Link
                href="/chat"
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                title={t.openFull}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </Link>
{messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  title={t.clear}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => { setOpen(false); setShowThreads(false); }}
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Thread List Sidebar (overlay) */}
          {showThreads && (
            <div className="absolute inset-0 bg-white dark:bg-zinc-900 z-10 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t.recentChats}</h3>
                <button
                  onClick={() => setShowThreads(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {threads.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">No chats yet</p>
                )}
                {threads.map((thread) => (
                  <div key={thread.id} className="group flex items-center gap-2">
                    <button
                      onClick={() => { loadThread(thread.id); setShowThreads(false); }}
                      className="flex-1 text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg truncate"
                    >
                      <span className="font-medium block truncate">{thread.title}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(thread.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      onClick={() => removeThread(thread.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-md transition-opacity"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t.newChat}
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t.askPrompt}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{t.example}</p>
                {open && !modelLoaded && (
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 animate-pulse">{t.loadingModel}</p>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-zinc-700 text-gray-800 dark:text-white rounded-bl-md border border-gray-200 dark:border-zinc-600'
                  )}
                  dir={msg.lang === 'ar' ? 'rtl' : 'ltr'}
                >
                  {/* Message text with verse linking */}
                  {msg.role === 'assistant' && onNavigateToVerse ? (
                    <LinkedVerseText text={msg.text} onVerseClick={handleNavigateToVerse} />
                  ) : (
                    <p>{msg.text}</p>
                  )}

                  {/* Translation loading indicator */}
                  {msg.isTranslating && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-teal-600 dark:text-teal-400">
                      <div className="w-3 h-3 border-2 border-teal-600 dark:border-teal-400 border-t-transparent rounded-full animate-spin" />
                      {t.translating}
                    </div>
                  )}

                  {/* Sources: Quran verses + Hadith */}
                  {msg.role === 'assistant' && ((msg.verses && msg.verses.length > 0) || (msg.hadith && msg.hadith.length > 0)) && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-zinc-700 space-y-1.5" dir="ltr">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{t.sources}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.verses?.map((v, i) => (
                          <button
                            key={`v-${i}`}
                            onClick={() => handleNavigateToVerse(v.surah, v.ayah)}
                            className="text-[10px] px-2 py-0.5 bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 rounded-full font-medium hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
                          >
                            {v.surah}:{v.ayah}
                          </button>
                        ))}
                        {msg.hadith?.map((h, i) => (
                          <span
                            key={`h-${i}`}
                            className="text-[10px] px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full font-medium"
                          >
                            {h.book_name_en ?? h.book_name_ar} #{h.num_in_book}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Language toggle for assistant messages */}
                  {msg.role === 'assistant' && !msg.isTranslating && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {[
                        { code: 'en', label: 'EN' },
                        { code: 'bn', label: 'বাং' },
                      ].map((l) => (
                        <button
                          key={l.code}
                          onClick={() => translateMessage(msg.id, l.code)}
                          disabled={loading}
                          className={clsx(
                            'text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors',
                            msg.lang === l.code
                              ? 'bg-teal-600 text-white'
                              : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-700'
                          )}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
                  {loadingMessage ? (
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">{loadingMessage}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-100 dark:border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.placeholder}
                disabled={loading}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
