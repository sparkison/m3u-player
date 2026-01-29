/**
 * Player State Context
 * Manages playback state for persistence and cross-component communication
 */

import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';

// Initial state
const initialState = {
  // Playback state
  url: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  playbackRate: 1,

  // Stream info
  streamType: null,
  streamCategory: null,
  isLive: false,

  // Media info
  mediaInfo: {
    videoCodec: null,
    audioCodec: null,
    width: null,
    height: null,
    bitrate: null,
  },

  // Status
  status: 'idle', // idle | loading | ready | playing | paused | error | remuxing
  error: null,
  remuxProgress: 0,

  // History for resume functionality
  history: {}, // { url: { position, timestamp } }
};

// Action types
const ActionTypes = {
  SET_URL: 'SET_URL',
  SET_PLAYING: 'SET_PLAYING',
  SET_TIME: 'SET_TIME',
  SET_DURATION: 'SET_DURATION',
  SET_BUFFERED: 'SET_BUFFERED',
  SET_VOLUME: 'SET_VOLUME',
  SET_MUTED: 'SET_MUTED',
  SET_PLAYBACK_RATE: 'SET_PLAYBACK_RATE',
  SET_STREAM_INFO: 'SET_STREAM_INFO',
  SET_MEDIA_INFO: 'SET_MEDIA_INFO',
  SET_STATUS: 'SET_STATUS',
  SET_ERROR: 'SET_ERROR',
  SET_REMUX_PROGRESS: 'SET_REMUX_PROGRESS',
  SAVE_POSITION: 'SAVE_POSITION',
  LOAD_HISTORY: 'LOAD_HISTORY',
  RESET: 'RESET',
};

// Reducer
function playerReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_URL:
      return {
        ...state,
        url: action.payload,
        status: 'loading',
        error: null,
        currentTime: 0,
        duration: 0,
      };

    case ActionTypes.SET_PLAYING:
      return {
        ...state,
        isPlaying: action.payload,
        status: action.payload ? 'playing' : 'paused',
      };

    case ActionTypes.SET_TIME:
      return { ...state, currentTime: action.payload };

    case ActionTypes.SET_DURATION:
      return { ...state, duration: action.payload };

    case ActionTypes.SET_BUFFERED:
      return { ...state, buffered: action.payload };

    case ActionTypes.SET_VOLUME:
      return { ...state, volume: action.payload };

    case ActionTypes.SET_MUTED:
      return { ...state, muted: action.payload };

    case ActionTypes.SET_PLAYBACK_RATE:
      return { ...state, playbackRate: action.payload };

    case ActionTypes.SET_STREAM_INFO:
      return {
        ...state,
        streamType: action.payload.type,
        streamCategory: action.payload.category,
        isLive: action.payload.isLive || false,
      };

    case ActionTypes.SET_MEDIA_INFO:
      return {
        ...state,
        mediaInfo: { ...state.mediaInfo, ...action.payload },
      };

    case ActionTypes.SET_STATUS:
      return { ...state, status: action.payload };

    case ActionTypes.SET_ERROR:
      return { ...state, status: 'error', error: action.payload };

    case ActionTypes.SET_REMUX_PROGRESS:
      return { ...state, remuxProgress: action.payload, status: 'remuxing' };

    case ActionTypes.SAVE_POSITION:
      return {
        ...state,
        history: {
          ...state.history,
          [action.payload.url]: {
            position: action.payload.position,
            timestamp: Date.now(),
          },
        },
      };

    case ActionTypes.LOAD_HISTORY:
      return { ...state, history: action.payload };

    case ActionTypes.RESET:
      return { ...initialState, history: state.history };

    default:
      return state;
  }
}

// Context
const PlayerContext = createContext(null);

// Provider component
export function PlayerProvider({ children, persistKey = 'm3u-player-state' }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(persistKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.history) {
          dispatch({ type: ActionTypes.LOAD_HISTORY, payload: parsed.history });
        }
      }
    } catch (e) {
      console.warn('Failed to load player history:', e);
    }
  }, [persistKey]);

  // Save history to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(persistKey, JSON.stringify({ history: state.history }));
    } catch (e) {
      console.warn('Failed to save player history:', e);
    }
  }, [state.history, persistKey]);

  // Action creators
  const actions = {
    setUrl: useCallback((url) => {
      dispatch({ type: ActionTypes.SET_URL, payload: url });
    }, []),

    setPlaying: useCallback((isPlaying) => {
      dispatch({ type: ActionTypes.SET_PLAYING, payload: isPlaying });
    }, []),

    setTime: useCallback((time) => {
      dispatch({ type: ActionTypes.SET_TIME, payload: time });
    }, []),

    setDuration: useCallback((duration) => {
      dispatch({ type: ActionTypes.SET_DURATION, payload: duration });
    }, []),

    setBuffered: useCallback((buffered) => {
      dispatch({ type: ActionTypes.SET_BUFFERED, payload: buffered });
    }, []),

    setVolume: useCallback((volume) => {
      dispatch({ type: ActionTypes.SET_VOLUME, payload: volume });
    }, []),

    setMuted: useCallback((muted) => {
      dispatch({ type: ActionTypes.SET_MUTED, payload: muted });
    }, []),

    setPlaybackRate: useCallback((rate) => {
      dispatch({ type: ActionTypes.SET_PLAYBACK_RATE, payload: rate });
    }, []),

    setStreamInfo: useCallback((info) => {
      dispatch({ type: ActionTypes.SET_STREAM_INFO, payload: info });
    }, []),

    setMediaInfo: useCallback((info) => {
      dispatch({ type: ActionTypes.SET_MEDIA_INFO, payload: info });
    }, []),

    setStatus: useCallback((status) => {
      dispatch({ type: ActionTypes.SET_STATUS, payload: status });
    }, []),

    setError: useCallback((error) => {
      dispatch({ type: ActionTypes.SET_ERROR, payload: error });
    }, []),

    setRemuxProgress: useCallback((progress) => {
      dispatch({ type: ActionTypes.SET_REMUX_PROGRESS, payload: progress });
    }, []),

    savePosition: useCallback((url, position) => {
      dispatch({ type: ActionTypes.SAVE_POSITION, payload: { url, position } });
    }, []),

    getSavedPosition: useCallback((url) => {
      const entry = state.history[url];
      if (entry) {
        // Only return position if saved within last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (entry.timestamp > weekAgo) {
          return entry.position;
        }
      }
      return 0;
    }, [state.history]),

    reset: useCallback(() => {
      dispatch({ type: ActionTypes.RESET });
    }, []),
  };

  return (
    <PlayerContext.Provider value={{ state, ...actions }}>
      {children}
    </PlayerContext.Provider>
  );
}

// Hook to use player context
export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

export default PlayerContext;
