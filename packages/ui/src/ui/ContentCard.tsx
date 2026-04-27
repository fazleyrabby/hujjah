'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface ContentCardProps {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'subtle';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * ContentCard - Minimalist card with subtle depth
 * Uses Tailwind utilities for all styling
 */
export function ContentCard({
  children,
  variant = 'default',
  hover = true,
  padding = 'md',
  className = '',
}: ContentCardProps) {
  const variants = {
    default: 'bg-white border border-gray-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]',
    elevated: 'bg-white border border-gray-200 shadow-[0_4px_12px_0_rgba(0,0,0,0.08)]',
    subtle: 'bg-white border border-gray-100 shadow-none',
  };

  const paddingStyles = {
    none: '',
    sm: 'p-2',
    md: 'p-4 md:p-6',
    lg: 'p-6 md:p-8',
  };

  return (
    <motion.div
      className={`
        rounded-lg
        transition-all
        duration-200
        ease-out
        ${variants[variant]}
        ${paddingStyles[padding]}
        ${hover ? 'hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] hover:-translate-y-0.5' : ''}
        ${className}
      `.trim()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      whileHover={hover ? { y: -2 } : undefined}
    >
      {children}
    </motion.div>
  );
}

/**
 * CardHeader - Consistent header styling
 */
interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-gray-900">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

/**
 * CardContent - Flexible content area
 */
export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

/**
 * CardFooter - Footer with optional separator
 */
interface CardFooterProps {
  children: ReactNode;
  separator?: boolean;
  className?: string;
}

export function CardFooter({ children, separator = true, className = '' }: CardFooterProps) {
  return (
    <div className={`mt-4 pt-4 ${separator ? 'border-t border-gray-100' : ''} ${className}`}>
      {children}
    </div>
  );
}

export default ContentCard;
