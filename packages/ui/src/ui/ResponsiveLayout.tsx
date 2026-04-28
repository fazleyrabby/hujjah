'use client';

import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ResponsiveLayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  detailsPanel?: ReactNode;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

/**
 * ResponsiveLayout - Adapts to mobile, tablet, and desktop
 * 
 * Mobile: Single column
 * Tablet: Sidebar + Content
 * Desktop: Sidebar + Content + Details Panel
 */
export function ResponsiveLayout({
  children,
  sidebar,
  detailsPanel,
  showSidebar = false,
  onToggleSidebar,
}: ResponsiveLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(showSidebar);

  return (
    <div className="min-h-screen bg-[#FDFDFB]">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 bg-white border-b border-gray-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between px-4 py-3">
          {onToggleSidebar && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          
          <h1 className="text-lg font-semibold text-gray-900">Hujjah</h1>
          
          <div className="w-10" /> {/* Spacer for balance */}
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/20 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Sidebar */}
            <motion.div
              className="fixed top-0 left-0 bottom-0 w-72 bg-white border-r border-gray-200 z-50 lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {sidebar}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Layout */}
      <div className="flex">
        {/* Desktop Sidebar */}
        {sidebar && (
          <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-gray-200 bg-white sticky top-0 h-screen overflow-y-auto">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Navigation
              </h2>
              {sidebar}
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className={`flex-1 min-w-0 ${detailsPanel ? 'lg:mr-80' : ''}`}>
          <div className="max-w-4xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>

        {/* Desktop Details Panel */}
        {detailsPanel && (
          <aside className="hidden lg:block w-80 flex-shrink-0 border-l border-gray-200 bg-white sticky top-0 h-screen overflow-y-auto">
            <div className="p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Details
              </h2>
              {detailsPanel}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * MobileNav - Navigation items for mobile/tablet
 */
interface MobileNavItem {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick: () => void;
}

export function MobileNavItem({ label, icon, active, onClick }: MobileNavItem) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full
        flex items-center gap-3
        px-3 py-2.5
        rounded-lg
        text-left
        transition-all
        duration-200
        ${active
          ? 'bg-teal-50 text-teal-700'
          : 'text-gray-600 hover:bg-gray-50'
        }
      `}
    >
      {icon && <span className="w-5 h-5">{icon}</span>}
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}

/**
 * Section - Content section with consistent spacing
 */
interface SectionProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function Section({ title, subtitle, children, className = '' }: SectionProps) {
  return (
    <section className={`mb-8 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-sm text-gray-500">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export default ResponsiveLayout;
