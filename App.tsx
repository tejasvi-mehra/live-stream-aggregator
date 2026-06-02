import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StreamEvent, StreamSource } from './types';
import {
  checkCatalogHealth,
  filterCatalog,
  findEventById,
  findNextPlayableSourceInEvent,
  getFirstPlayableSource,
  getVisibleEvents,
  isEventPlayable,
  loadConfiguredCatalog,
  getProfileMeta,
} from './services/streamService';
import { APP_NAME } from './constants';
import Header from './components/Header';
import VideoPlayer from './components/VideoPlayer';
import EventCard from './components/EventCard';

const App: React.FC = () => {
  const profile = getProfileMeta();
  const [categories, setCategories] = useState(() => loadConfiguredCatalog());
  const [loading, setLoading] = useState(true);
  const [healthUnavailable, setHealthUnavailable] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StreamEvent | null>(null);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setHealthUnavailable(false);
    const configured = loadConfiguredCatalog();
    const result = await checkCatalogHealth(configured);
    setCategories(result.categories);
    setHealthUnavailable(result.healthUnavailable);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filteredCategories = useMemo(
    () => filterCatalog(categories, searchQuery, selectedCategory),
    [categories, searchQuery, selectedCategory]
  );

  const visibleEvents = useMemo(() => getVisibleEvents(categories), [categories]);

  const featuredEvent = useMemo(() => {
    const filteredEvents = filteredCategories.flatMap((category) => category.events);
    return filteredEvents.find((event) => isEventPlayable(event)) ?? null;
  }, [filteredCategories]);

  const categoryFilters = useMemo(
    () => [
      { id: 'all', name: 'All Sports' },
      ...categories.map((category) => ({ id: category.id, name: category.name })),
    ],
    [categories]
  );

  const syncActiveSource = (event: StreamEvent, source: StreamSource | null) => {
    setSelectedEvent(event);
    setActiveSource(source);
  };

  const handleEventSelect = (event: StreamEvent) => {
    const firstPlayable = getFirstPlayableSource(event);
    if (!firstPlayable) return;
    syncActiveSource(event, firstPlayable);
    setIsMinimized(false);
  };

  const handleNextSource = () => {
    if (!selectedEvent || !activeSource) return;
    const next = findNextPlayableSourceInEvent(selectedEvent, activeSource.id, 1);
    if (next) setActiveSource(next);
  };

  const handlePrevSource = () => {
    if (!selectedEvent || !activeSource) return;
    const prev = findNextPlayableSourceInEvent(selectedEvent, activeSource.id, -1);
    if (prev) setActiveSource(prev);
  };

  const handleFailover = (source: StreamSource) => {
    if (!selectedEvent) return;
    const refreshedEvent = findEventById(categories, selectedEvent.id) ?? selectedEvent;
    const refreshedSource =
      refreshedEvent.streams.find((item) => item.id === source.id) ?? source;
    syncActiveSource(refreshedEvent, refreshedSource);
  };

  const handleSelectSource = (source: StreamSource) => {
    if (!selectedEvent || source.id === activeSource?.id) return;
    const refreshedEvent = findEventById(categories, selectedEvent.id) ?? selectedEvent;
    const refreshedSource =
      refreshedEvent.streams.find((item) => item.id === source.id) ?? source;
    syncActiveSource(refreshedEvent, refreshedSource);
  };

  const availableCount = visibleEvents.filter((event) => isEventPlayable(event)).length;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onHomeClick={() => {
          setSearchQuery('');
          setSelectedCategory('all');
        }}
      />

      <main className="flex-1 pb-20">
        {featuredEvent && !searchQuery && selectedCategory === 'all' && !loading && (
          <div className="relative w-full h-[50vh] md:h-[70vh] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />
            <img
              src={featuredEvent.logo || `https://picsum.photos/seed/${featuredEvent.id}/1920/1080`}
              alt=""
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute bottom-0 left-0 p-6 md:p-16 z-20 max-w-2xl">
              <span className="bg-red-600 text-xs font-black px-2 py-1 rounded mb-4 inline-block tracking-tighter uppercase">
                Live Now
              </span>
              <h1 className="text-4xl md:text-5xl font-black mb-4 leading-none">{featuredEvent.name}</h1>
              <p className="text-slate-300 md:text-lg mb-6">{profile.description}</p>
              <button
                onClick={() => handleEventSelect(featuredEvent)}
                className="bg-emerald-500 text-black px-8 py-3 rounded-md font-bold text-lg flex items-center gap-2 hover:bg-emerald-400 transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Live
              </button>
            </div>
          </div>
        )}

        <div className={`px-6 md:px-16 ${featuredEvent && !searchQuery && selectedCategory === 'all' && !loading ? 'pt-12' : 'pt-24'}`}>
          {healthUnavailable && !loading && (
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3">
              <p className="text-sm text-amber-100">
                Could not verify stream availability. HLS events are playable but may fail until the backend responds.
              </p>
              <button
                onClick={loadCatalog}
                className="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-bold text-black hover:bg-amber-500"
              >
                Retry connection
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <h2 className="text-2xl md:text-3xl font-black">Live Sports</h2>
              <p className="text-slate-500 mt-2">
                {loading
                  ? 'Checking stream availability...'
                  : healthUnavailable
                    ? `${availableCount} events playable (unverified HLS)`
                    : `${availableCount}/${visibleEvents.length} events available`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categoryFilters.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                    selectedCategory === category.id
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
              <p className="text-slate-400 font-medium">Loading events...</p>
            </div>
          ) : filteredCategories.length > 0 ? (
            <div className="space-y-12">
              {filteredCategories.map((category) => (
                <section key={category.id}>
                  <h3 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3">
                    {category.name}
                    <span className="text-slate-500 text-sm font-medium">
                      {category.events.length} events
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
                    {category.events.length > 0 ? (
                      category.events.map((event) => (
                        <EventCard key={event.id} event={event} onClick={handleEventSelect} />
                      ))
                    ) : (
                      <p className="col-span-full text-slate-500 text-sm py-4">
                        No events for this category.
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <h3 className="text-xl font-bold mb-2">No events match your filters</h3>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-6 text-emerald-400 font-bold hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </main>

      {selectedEvent && activeSource && (
        <VideoPlayer
          event={selectedEvent}
          activeStream={activeSource}
          isMinimized={isMinimized}
          onMinimize={() => setIsMinimized(true)}
          onExpand={() => setIsMinimized(false)}
          onClose={() => {
            setSelectedEvent(null);
            setActiveSource(null);
            setIsMinimized(false);
          }}
          onNext={handleNextSource}
          onPrevious={handlePrevSource}
          onFailover={handleFailover}
          onSelectSource={handleSelectSource}
        />
      )}

      <footer className="bg-slate-900 border-t border-slate-800 py-12 px-6 text-center">
        <span className="text-xl font-black tracking-tighter">{APP_NAME}</span>
      </footer>
    </div>
  );
};

export default App;
