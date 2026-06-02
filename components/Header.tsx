
import React, { useEffect, useState } from 'react';
import { APP_NAME } from '../constants';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onHomeClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ searchQuery, setSearchQuery, onHomeClick }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 px-6 md:px-16 py-4 flex items-center justify-between ${
        scrolled ? 'bg-slate-950/95 backdrop-blur-md shadow-2xl py-3' : 'bg-transparent'
      }`}
    >
      <div className="flex items-center gap-6 md:gap-10">
        <div onClick={onHomeClick} className="flex items-center gap-2 cursor-pointer group">
          <div className="bg-emerald-600 text-white p-1.5 rounded-lg group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="text-xl md:text-2xl font-black tracking-tighter">{APP_NAME}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-8">
        <div className="relative group hidden sm:block">
          <input
            type="text"
            placeholder="Search streams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-900/50 border border-slate-700/50 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/50 focus:bg-slate-900 w-40 md:w-64 transition-all"
          />
          <svg
            className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>
    </header>
  );
};

export default Header;
