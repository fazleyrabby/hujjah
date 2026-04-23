'use client';

import { motion } from 'framer-motion';

interface LoadingSkeletonProps {
  type?: 'text' | 'card' | 'hadith' | 'search';
  lines?: number;
  className?: string;
}

/**
 * LoadingSkeleton - Subtle loading states for content
 */
export function LoadingSkeleton({
  type = 'text',
  lines = 3,
  className = '',
}: LoadingSkeletonProps) {
  if (type === 'card') {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-100 animate-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-100 rounded animate-shimmer w-1/3" />
            <div className="h-3 bg-gray-100 rounded animate-shimmer w-1/4" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded animate-shimmer" />
          <div className="h-3 bg-gray-100 rounded animate-shimmer w-5/6" />
          <div className="h-3 bg-gray-100 rounded animate-shimmer w-4/6" />
        </div>
      </div>
    );
  }

  if (type === 'hadith') {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 animate-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-gray-100 rounded animate-shimmer" />
            <div className="h-6 bg-gray-100 rounded animate-shimmer w-5/6" />
          </div>
        </div>
        <div className="pl-11 space-y-2">
          <div className="h-4 bg-gray-100 rounded animate-shimmer" />
          <div className="h-4 bg-gray-100 rounded animate-shimmer w-5/6" />
          <div className="h-4 bg-gray-100 rounded animate-shimmer w-4/6" />
        </div>
      </div>
    );
  }

  if (type === 'search') {
    return (
      <div className={`space-y-4 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded animate-shimmer w-3/4" />
                <div className="h-3 bg-gray-100 rounded animate-shimmer w-1/2" />
              </div>
              <div className="w-16 h-6 bg-gray-100 rounded-full animate-shimmer" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 bg-gray-100 rounded animate-shimmer" />
              <div className="h-3 bg-gray-100 rounded animate-shimmer w-5/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default text skeleton
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-100 rounded animate-shimmer"
          style={{ width: `${100 - (i * 10)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * AnswerLoading - Specialized skeleton for RAG answer generation
 */
interface AnswerLoadingProps {
  phase?: 'searching' | 'synthesizing' | 'complete';
}

export function AnswerLoading({ phase = 'searching' }: AnswerLoadingProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header with loading indicator */}
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <motion.div
            className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            {phase === 'searching' && 'Searching knowledge base...'}
            {phase === 'synthesizing' && 'Synthesizing answer...'}
            {phase === 'complete' && 'Answer ready'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {phase === 'searching' && 'Finding relevant passages'}
            {phase === 'synthesizing' && 'Generating response'}
            {phase === 'complete' && 'Review the answer below'}
          </p>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-3">
        <div className="h-4 bg-gray-100 rounded animate-shimmer" />
        <div className="h-4 bg-gray-100 rounded animate-shimmer" />
        <div className="h-4 bg-gray-100 rounded animate-shimmer w-5/6" />
        <div className="h-4 bg-gray-100 rounded animate-shimmer w-4/6" />
      </div>

      {/* Source references skeleton */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
          Sources
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200"
            >
              <div className="h-3 w-24 bg-gray-100 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * PageLoading - Full page loading state
 */
export function PageLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="h-10 bg-gray-100 rounded animate-shimmer w-1/3" />
      <LoadingSkeleton type="text" lines={2} />
      <LoadingSkeleton type="card" />
      <LoadingSkeleton type="search" lines={3} />
    </div>
  );
}

export default LoadingSkeleton;
