'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import LinkedVerseText from '@/components/LinkedVerseText';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(288); // 288px = w-72
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(288);

  const {
    threadId,
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
  } = useChat();

  const [activeLang, setActiveLang] = useState(
    () => threads.find((thread) => thread.id === threadId)?.lang ?? 'en'
  );

  // Auto-detect input language for RTL/text direction
  const [inputLang, setInputLang] = useState<'en' | 'bn' | 'ar'>('en');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Load model on mount
  useEffect(() => {
    if (!modelLoaded) {
      import('@/lib/ai/llama').then(({ loadLlamaModel, getTieredModelPath }) => {
        getTieredModelPath().then((path) => {
          loadLlamaModel(path)
            .then(() => setModelLoaded(true))
            .catch(() => setModelLoaded(true));
        });
      });
    }
  }, [modelLoaded]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    // sendMessage auto-detects language from input text
    await sendMessage(text, activeLang);
  };

  const handleNavigateToVerse = (surah: number, ayah: number) => {
    router.push(`/?surah=${surah}&ayah=${ayah}`);
  };

  const handleCreateThread = () => {
    createThread(activeLang);
    setSidebarOpen(false);
  };

  const handleLoadThread = (id: string) => {
    const thread = threads.find((item) => item.id === id);
    if (thread?.lang) {
      setActiveLang(thread.lang);
    }
    loadThread(id);
    setSidebarOpen(false);
  };

  const handleRemoveThread = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    if (id === threadId) {
      const nextThread = threads.find((thread) => thread.id !== id);
      if (nextThread?.lang) {
        setActiveLang(nextThread.lang);
      }
    }
    removeThread(id);
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;
      const newWidth = Math.min(480, Math.max(200, dragStartWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const isBn = activeLang === 'bn';
  const isAr = activeLang === 'ar';

  const t = {
    title: isBn ? 'হুজ্জাহ এআই' : isAr ? 'هجة AI' : 'Hujjah AI',
    newChat: isBn ? 'নতুন চ্যাট' : isAr ? 'محادثة جديدة' : 'New Chat',
    placeholder: isBn ? 'এখানে লিখুন...' : isAr ? 'اكتب سؤالك هنا...' : 'Type your question...',
    askPrompt: isBn ? 'কুরআন ও হাদিস সম্পর্কে জিজ্ঞাসা করুন' : isAr ? 'اسأل عن القرآن والحديث' : 'Ask about Quran & Hadith',
    example: isBn ? 'যেমন: "সালাত সম্পর্কে ব্যাখ্যা করুন"' : isAr ? 'مثال: "اشرح مفهوم التوبة"' : 'e.g., "explain the concept of tawbah"',
    sources: isBn ? 'সূত্র' : isAr ? 'المصادر' : 'Sources',
    loadingModel: isBn ? '🧠 লোকাল মডেল লোড হচ্ছে...' : isAr ? '🧠 جاري تحميل النموذج المحلي...' : '🧠 Loading local model...',
    translating: isBn ? 'অনুবাদ হচ্ছে...' : isAr ? 'جاري الترجمة...' : 'Translating...',
    back: isBn ? '← ফিরে যান' : isAr ? '← رجوع' : '← Back',
  };

  return (
    <div className="relative h-screen overflow-hidden bg-white dark:bg-zinc-900 md:flex">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close thread sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}

      {/* Sidebar — Thread List */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-950 transition-transform duration-300 md:static md:z-0 md:transition-none',
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full md:translate-x-0 md:border-r-0'
        )}
        style={{ width: sidebarOpen ? sidebarWidth : 0, maxWidth: '85vw', minWidth: sidebarOpen ? 200 : 0 }}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.title}</h2>
          <button
            onClick={handleCreateThread}
            className="p-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
            title={t.newChat}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 px-4">
              No chats yet. Start a new conversation!
            </p>
          )}
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={clsx(
                'group flex items-center gap-2 px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-zinc-800 min-w-0',
                thread.id === threadId
                  ? 'bg-white dark:bg-zinc-900 border-l-4 border-l-teal-600'
                  : 'hover:bg-white dark:hover:bg-zinc-900 border-l-4 border-l-transparent'
              )}
            >
              <button
                onClick={() => handleLoadThread(thread.id)}
                className="flex-1 min-w-0 text-left"
              >
                <p className={clsx(
                  'text-sm font-medium truncate block w-full',
                  thread.id === threadId ? 'text-teal-700 dark:text-teal-400' : 'text-gray-800 dark:text-gray-200'
                )}
                  title={thread.title}
                >
                  {thread.title.length > 40 ? thread.title.slice(0, 40) + '…' : thread.title}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(thread.updatedAt).toLocaleDateString()} · {thread.messages.length} messages
                </p>
              </button>
              <button
                onClick={(e) => handleRemoveThread(e, thread.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-md transition-opacity"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Drag handle — right edge of sidebar */}
        {sidebarOpen && (
          <div
            onMouseDown={handleDragStart}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-teal-400/40 dark:hover:bg-teal-600/40 transition-colors z-50"
            title="Drag to resize"
          />
        )}
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                {threads.find((t) => t.id === threadId)?.title || t.title}
              </h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Local model · 100% offline</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language selector */}
            <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {[
                { code: 'en', label: 'EN' },
                { code: 'bn', label: 'বাং' },
              ].map((l) => (
                <button
                  key={l.code}
                  onClick={() => setActiveLang(l.code)}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    activeLang === l.code
                      ? 'bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              {t.back}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-teal-50 dark:bg-teal-900/20 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-lg text-gray-700 dark:text-gray-300 font-medium mb-1">{t.askPrompt}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">{t.example}</p>
              {!modelLoaded && (
                <p className="text-sm text-teal-600 dark:text-teal-400 mt-4 animate-pulse">{t.loadingModel}</p>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[75%] rounded-2xl px-5 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-teal-600 text-white rounded-br-md'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-white rounded-bl-md border border-gray-200 dark:border-zinc-700'
                )}
                dir={msg.lang === 'ar' ? 'rtl' : 'ltr'}
              >
                {msg.role === 'assistant' ? (
                  <LinkedVerseText text={msg.text} onVerseClick={handleNavigateToVerse} />
                ) : (
                  <p>{msg.text}</p>
                )}

                {/* Translation loading */}
                {msg.isTranslating && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-teal-600 dark:text-teal-400">
                    <div className="w-3.5 h-3.5 border-2 border-teal-600 dark:border-teal-400 border-t-transparent rounded-full animate-spin" />
                    {t.translating}
                  </div>
                )}

                {/* Sources */}
                {msg.role === 'assistant' && ((msg.verses && msg.verses.length > 0) || (msg.hadith && msg.hadith.length > 0)) && (
                  <div className="mt-3 pt-2 border-t border-gray-200 dark:border-zinc-700 space-y-1.5" dir="ltr">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{t.sources}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.verses?.map((v, i) => (
                        <button
                          key={`v-${i}`}
                          onClick={() => handleNavigateToVerse(v.surah, v.ayah)}
                          className="text-[10px] px-2.5 py-1 bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 rounded-full font-medium hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
                        >
                          {v.surah}:{v.ayah}
                        </button>
                      ))}
                      {msg.hadith?.map((h, i) => (
                        <span
                          key={`h-${i}`}
                          className="text-[10px] px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full font-medium"
                        >
                          {h.book_name_en ?? h.book_name_ar} #{h.num_in_book}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Language toggle */}
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
                            : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-700'
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
              <div className="bg-gray-100 dark:bg-zinc-800 rounded-2xl rounded-bl-md px-5 py-3 max-w-[75%]">
                {loadingMessage ? (
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-teal-600 dark:text-teal-400 font-medium">{loadingMessage}</span>
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
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mx-auto max-w-[75%]">
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const v = e.target.value;
                if (/[\u0600-\u06FF\u0750-\u077F]/.test(v)) setInputLang('ar');
                else if (/[\u0980-\u09FF]/.test(v)) setInputLang('bn');
                else setInputLang('en');
              }}
              placeholder={t.placeholder}
              disabled={loading}
              dir={inputLang === 'ar' ? 'rtl' : 'ltr'}
              className="flex-1 px-5 py-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
