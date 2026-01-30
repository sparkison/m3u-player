/**
 * Demo App for UniversalPlayer
 * Standalone testing interface with URL input
 */

import { useState, useRef, useCallback } from 'react';
import UniversalPlayer from './components/UniversalPlayer';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { detectStreamType, StreamType } from './utils/streamDetector';
import logo from './assets/logo.svg';

import './App.css';

// Sample URLs for testing (CORS-enabled sources)
const SAMPLE_URLS = [
  {
    label: 'Big Buck Bunny (MP4)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    type: 'mp4',
  },
  {
    label: 'Big Buck Bunny (MKV)',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mkv/1080/Big_Buck_Bunny_1080_10s_30MB.mkv',
    type: 'mkv',
  },
  {
    label: 'Sintel (HLS)',
    url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    type: 'hls',
  },
  {
    label: 'Sintel (DASH)',
    url: 'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',
    type: 'dash',
  },
];

function PlayerDemo() {
  const [url, setUrl] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [streamInfo, setStreamInfo] = useState(null);
  const [playbackInfo, setPlaybackInfo] = useState({ currentTime: 0, duration: 0 });
  const [status, setStatus] = useState('idle');
  const playerRef = useRef(null);
  const resumePromptedRef = useRef(null); // Track which URL we've prompted for

  const { savePosition, getSavedPosition } = usePlayer();

  const handleLoad = useCallback(() => {
    if (inputValue.trim()) {
      setActiveUrl(inputValue.trim());
      setUrl(inputValue.trim());
      setStatus('loading');
    }
  }, [inputValue]);

  const handleSampleClick = useCallback((sampleUrl) => {
    setInputValue(sampleUrl);
    setActiveUrl(sampleUrl);
    setUrl(sampleUrl);
    setStatus('loading');
  }, []);

  const handleReady = useCallback(({ player, video }) => {
    setStatus('ready');

    // Check for saved position (only prompt once per URL, and only if > 5 seconds)
    if (activeUrl && resumePromptedRef.current !== activeUrl) {
      const savedPos = getSavedPosition(activeUrl);
      if (savedPos > 5 && video) {
        resumePromptedRef.current = activeUrl; // Mark as prompted
        const resume = window.confirm(
          `Resume from ${formatTime(savedPos)}?`
        );
        if (resume) {
          video.currentTime = savedPos;
        }
      }
    }
  }, [activeUrl, getSavedPosition]);

  const handleTimeUpdate = useCallback(({ currentTime, duration }) => {
    setPlaybackInfo({ currentTime, duration });

    // Save position every 5 seconds
    if (activeUrl && currentTime > 0 && Math.floor(currentTime) % 5 === 0) {
      savePosition(activeUrl, currentTime);
    }
  }, [activeUrl, savePosition]);

  const handleStreamInfo = useCallback((info) => {
    setStreamInfo(info);
  }, []);

  const handleError = useCallback((error) => {
    setStatus('error');
    console.error('Player error:', error);
  }, []);

  const handlePlay = useCallback(() => setStatus('playing'), []);
  const handlePause = useCallback(() => setStatus('paused'), []);

  // Detect stream type for display
  const detectedType = url ? detectStreamType(url) : null;

  return (
    <div className="demo-container">
      <header className="demo-header">
        <div className="header-title">
          <img src={logo} alt="M3U Player" className="header-logo" />
          <h1>M3U Player</h1>
        </div>
        <p>Supports HLS, DASH, MP4, MKV, AVI, and MPEG-TS streams</p>
      </header>

      <div className="demo-content">
        {/* URL Input Section */}
        <div className="url-input-section">
          <div className="input-group">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
              placeholder="Enter stream URL (HLS, DASH, MP4, MKV, AVI, TS...)"
              className="url-input"
            />
            <button onClick={handleLoad} className="load-button">
              Load
            </button>
          </div>

          {/* Sample URLs */}
          <div className="sample-urls">
            <span className="sample-label">Try:</span>
            {SAMPLE_URLS.map((sample, i) => (
              <button
                key={i}
                onClick={() => handleSampleClick(sample.url)}
                className="sample-button"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {/* Player Section */}
        <div className="player-section">
          {url ? (
            <UniversalPlayer
              ref={playerRef}
              url={url}
              autoPlay
              controls
              onReady={handleReady}
              onPlay={handlePlay}
              onPause={handlePause}
              onTimeUpdate={handleTimeUpdate}
              onStreamInfo={handleStreamInfo}
              onError={handleError}
              className="demo-player"
            />
          ) : (
            <div className="player-placeholder">
              <div className="placeholder-content">
                <svg width="64" height="64" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
                <p>Enter a URL above to start playing</p>
              </div>
            </div>
          )}
        </div>

        {/* Info Panel */}
        {url && (
          <div className="info-panel">
            <div className="info-section">
              <h3>Stream Info</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Status</span>
                  <span className={`info-value status-${status}`}>{status}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Type</span>
                  <span className="info-value">
                    {detectedType?.type || 'unknown'}
                    {detectedType?.category === 'live' && ' (Live)'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Time</span>
                  <span className="info-value">
                    {formatTime(playbackInfo.currentTime)} / {formatTime(playbackInfo.duration)}
                  </span>
                </div>
              </div>
            </div>

            {streamInfo && (
              <div className="info-section">
                <h3>Media Details</h3>
                <div className="info-grid">
                  {streamInfo.width && streamInfo.height && (
                    <div className="info-item">
                      <span className="info-label">Resolution</span>
                      <span className="info-value">{streamInfo.width}x{streamInfo.height}</span>
                    </div>
                  )}
                  {streamInfo.videoCodec && (
                    <div className="info-item">
                      <span className="info-label">Video Codec</span>
                      <span className="info-value">{streamInfo.videoCodec}</span>
                    </div>
                  )}
                  {streamInfo.audioCodec && (
                    <div className="info-item">
                      <span className="info-label">Audio Codec</span>
                      <span className="info-value">{streamInfo.audioCodec}</span>
                    </div>
                  )}
                  {streamInfo.bandwidth && (
                    <div className="info-item">
                      <span className="info-label">Bitrate</span>
                      <span className="info-value">{Math.round(streamInfo.bandwidth / 1000)} kbps</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="demo-footer">
        <p>
          GitHub |&nbsp;
          <a href="https://github.com/sparkison/m3u-player" target="_blank" rel="noopener noreferrer">m3u-player</a>
        </p>
      </footer>
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function App() {
  return (
    <PlayerProvider>
      <PlayerDemo />
    </PlayerProvider>
  );
}

export default App;
