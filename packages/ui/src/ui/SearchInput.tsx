'use client';

import { useState, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';

interface SearchInputProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  loading?: boolean;
  className?: string;
}

/**
 * SearchInput - Minimalist search with subtle focus state
 */
export function SearchInput({
  placeholder = 'Ask a question...',
  onSearch,
  loading = false,
  className = '',
}: SearchInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = () => {
    if (value.trim() && !loading) {
      onSearch(value.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <motion.div
        className="
          flex items-center
          bg-white
          border
          rounded-lg
          overflow-hidden
          transition-all
          duration-200
          ease-out
          ${isFocused 
            ? 'border-teal-600 shadow-[0_0_0_3px_rgba(13,148,136,0.1)]' 
            : 'border-gray-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          }
        "
        animate={{
          scale: isFocused ? 1.01 : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        {/* Search Icon */}
        <svg
          className="w-5 h-5 ml-3 text-gray-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        {/* Input Field */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={loading}
          className="
            flex-1
            py-3
            px-2
            text-base
            text-gray-900
            placeholder-gray-400
            bg-transparent
            border-none
            outline-none
            disabled:opacity-50
          "
        />

        {/* Search Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !value.trim()}
          className="
            mr-2
            px-4
            py-2
            bg-gray-900
            text-white
            text-sm
            font-medium
            rounded-md
            transition-all
            duration-200
            disabled:opacity-50
            disabled:cursor-not-allowed
            hover:bg-gray-800
          "
        >
          {loading ? (
            <motion.div
              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            'Search'
          )}
        </button>
      </motion.div>

      {/* Focus Accent Line */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: isFocused ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
    </div>
  );
}

/**
 * SearchFilters - Optional filter chips for search refinement
 */
interface SearchFiltersProps {
  filters: string[];
  activeFilter?: string;
  onSelect: (filter: string) => void;
  className?: string;
}

export function SearchFilters({
  filters,
  activeFilter,
  onSelect,
  className = '',
}: SearchFiltersProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => onSelect(filter)}
          className={`
            px-3 py-1.5
            text-sm
            rounded-full
            border
            transition-all
            duration-200
            ${activeFilter === filter
              ? 'bg-teal-600 border-teal-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }
          `}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}

export default SearchInput;
