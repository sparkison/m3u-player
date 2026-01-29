/**
 * UniversalPlayer Component
 * Handles playback of HLS, DASH, MP4, MKV, AVI, and MPEG-TS streams
 *
 * Strategy:
 * - MP4/WebM: Native HTML5 video (avoids COEP issues with cross-origin)
 * - HLS/DASH: Shaka Player (needed for adaptive streaming)
 * - MPEG-TS Live: Shaka with proper config
 * - MKV/AVI: FFmpeg remux to fMP4, then native playback
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import shaka from 'shaka-player';
import { detectStreamType, StreamType, StreamCategory, needsRemuxing, getExtension } from '../utils/streamDetector';
import { remuxer } from '../services/RemuxerService';

// Install Shaka polyfills
shaka.polyfill.installAll();

/**
 * Determine if we should use native HTML5 video instead of Shaka
 * Native video avoids COEP issues with cross-origin resources
 */
function shouldUseNativePlayer(type) {
  // Use native player for simple container formats
  // Shaka is only needed for adaptive streaming (HLS/DASH)
  return [StreamType.MP4, StreamType.WEBM].includes(type);
}

const UniversalPlayer = forwardRef(function UniversalPlayer({
  url,
  autoPlay = false,
  muted = false,
  controls = true,
  loop = false,
  poster = null,
  className = '',
  style = {},
  onReady = null,
  onPlay = null,
  onPause = null,
  onTimeUpdate = null,
  onEnded = null,
  onError = null,
  onBuffering = null,
  onStreamInfo = null,
  onRemuxProgress = null,
}, ref) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const objectUrlRef = useRef(null);

  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [streamInfo, setStreamInfo] = useState(null);
  const [remuxProgress, setRemuxProgress] = useState(0);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: (time) => { if (videoRef.current) videoRef.current.currentTime = time; },
    getVideoElement: () => videoRef.current,
    getShakaPlayer: () => playerRef.current,
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || 0,
    getVolume: () => videoRef.current?.volume || 1,
    setVolume: (v) => { if (videoRef.current) videoRef.current.volume = v; },
    getMuted: () => videoRef.current?.muted || false,
    setMuted: (m) => { if (videoRef.current) videoRef.current.muted = m; },
  }), []);

  // Cleanup function
  const cleanup = useCallback(async () => {
    // Destroy Shaka player
    if (playerRef.current) {
      try {
        await playerRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying Shaka player:', e);
      }
      playerRef.current = null;
    }

    // Revoke object URL if we created one
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    // Clear video source
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
    }
  }, []);

  // Initialize native HTML5 video player (for MP4, WebM)
  // This avoids COEP issues with cross-origin resources
  const initNativePlayer = useCallback(async (mediaUrl) => {
    const video = videoRef.current;
    if (!video) return;

    return new Promise((resolve, reject) => {
      const handleCanPlay = () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);

        setStatus('ready');

        // Get stream info from video element
        const info = {
          width: video.videoWidth,
          height: video.videoHeight,
          videoCodec: 'native',
          audioCodec: 'native',
        };
        setStreamInfo(info);
        onStreamInfo?.(info);
        onReady?.({ player: null, video });

        if (autoPlay) {
          video.play().catch(e => console.warn('Autoplay blocked:', e));
        }

        resolve();
      };

      const handleError = () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
        reject(new Error('Failed to load media'));
      };

      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);

      // Set crossOrigin to anonymous for CORS
      video.crossOrigin = 'anonymous';
      video.src = mediaUrl;
      video.load();
    });
  }, [autoPlay, onReady, onStreamInfo]);

  // Initialize player for adaptive streaming (HLS/DASH)
  const initShakaPlayer = useCallback(async (mediaUrl, isLive = false) => {
    const video = videoRef.current;
    if (!video) return;

    // Check browser support
    if (!shaka.Player.isBrowserSupported()) {
      throw new Error('Browser not supported for Shaka Player');
    }

    // Create player
    const player = new shaka.Player();
    await player.attach(video);
    playerRef.current = player;

    // Configure for live streams
    if (isLive) {
      player.configure({
        streaming: {
          lowLatencyMode: true,
          inaccurateManifestTolerance: 0,
          rebufferingGoal: 0.5,
          bufferingGoal: 2,
          bufferBehind: 10,
          retryParameters: {
            maxAttempts: 10,
            baseDelay: 500,
            backoffFactor: 1.5,
          },
        },
        manifest: {
          retryParameters: {
            maxAttempts: 10,
            baseDelay: 500,
          },
        },
      });
    }

    // Error handling
    player.addEventListener('error', (event) => {
      const shakaError = event.detail;
      console.error('Shaka error:', shakaError);
      setError(shakaError.message || 'Playback error');
      setStatus('error');
      onError?.(shakaError);
    });

    // Buffering state
    player.addEventListener('buffering', (event) => {
      onBuffering?.(event.buffering);
      setStatus(event.buffering ? 'buffering' : 'ready');
    });

    // Load the media
    await player.load(mediaUrl);
    setStatus('ready');
    onReady?.({ player, video });

    // Report stream info
    const tracks = player.getVariantTracks();
    if (tracks.length > 0) {
      const track = tracks.find(t => t.active) || tracks[0];
      const info = {
        videoCodec: track.videoCodec,
        audioCodec: track.audioCodec,
        width: track.width,
        height: track.height,
        bandwidth: track.bandwidth,
      };
      setStreamInfo(info);
      onStreamInfo?.(info);
    }

    if (autoPlay) {
      try {
        await video.play();
      } catch (e) {
        // Autoplay may be blocked
        console.warn('Autoplay blocked:', e);
      }
    }
  }, [autoPlay, onReady, onError, onBuffering, onStreamInfo]);

  // Initialize player for remuxed content
  const initRemuxedPlayer = useCallback(async (mediaUrl, format) => {
    setStatus('remuxing');
    setRemuxProgress(0);

    // Set up progress callback
    remuxer.onProgress = ({ progress, time }) => {
      setRemuxProgress(progress || (time ? Math.min(time / 60, 1) : 0));
      onRemuxProgress?.(progress);
    };

    try {
      // Remux to fMP4
      const blob = await remuxer.remuxToFmp4(mediaUrl, format);
      const blobUrl = URL.createObjectURL(blob);
      objectUrlRef.current = blobUrl;

      // Use native player for the remuxed blob (no COEP issues with blob URLs)
      await initNativePlayer(blobUrl);
    } catch (e) {
      console.error('Remux error:', e);
      setError(`Remux failed: ${e.message}`);
      setStatus('error');
      onError?.(e);
    }
  }, [initNativePlayer, onRemuxProgress, onError]);

  // Main initialization effect
  useEffect(() => {
    if (!url) {
      cleanup();
      setStatus('idle');
      return;
    }

    const init = async () => {
      await cleanup();
      setStatus('loading');
      setError(null);

      try {
        const { type, category } = detectStreamType(url);
        const ext = getExtension(url);
        const isLive = category === StreamCategory.LIVE;

        console.log('Stream detected:', { url, type, category, ext, isLive });

        if (needsRemuxing(type)) {
          // MKV, AVI, etc - need FFmpeg remuxing
          await initRemuxedPlayer(url, ext || type);
        } else if (shouldUseNativePlayer(type)) {
          // MP4, WebM - use native HTML5 video (avoids COEP issues)
          console.log('Using native player for:', type);
          await initNativePlayer(url);
        } else {
          // HLS, DASH, TS - need Shaka for adaptive streaming
          console.log('Using Shaka player for:', type);
          await initShakaPlayer(url, isLive);
        }
      } catch (e) {
        console.error('Player init error:', e);
        setError(e.message || 'Failed to initialize player');
        setStatus('error');
        onError?.(e);
      }
    };

    init();

    return () => {
      cleanup();
    };
  }, [url, cleanup, initNativePlayer, initShakaPlayer, initRemuxedPlayer, onError]);

  // Video event handlers
  const handlePlay = useCallback(() => {
    setStatus('playing');
    onPlay?.();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    setStatus('paused');
    onPause?.();
  }, [onPause]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      onTimeUpdate?.({
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration,
        buffered: videoRef.current.buffered,
      });
    }
  }, [onTimeUpdate]);

  const handleEnded = useCallback(() => {
    setStatus('ended');
    onEnded?.();
  }, [onEnded]);

  const handleVideoError = useCallback((e) => {
    // Only handle if we don't already have an error from Shaka
    if (!error) {
      const video = videoRef.current;
      let message = 'Playback error';
      if (video?.error) {
        switch (video.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            message = 'Playback aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            message = 'Network error';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            message = 'Decode error';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message = 'Format not supported';
            break;
        }
      }
      setError(message);
      setStatus('error');
      onError?.(new Error(message));
    }
  }, [error, onError]);

  return (
    <div className={`universal-player ${className}`} style={{ position: 'relative', ...style }}>
      <video
        ref={videoRef}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        poster={poster}
        playsInline
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleVideoError}
        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
      />

      {/* Loading overlay */}
      {(status === 'loading' || status === 'buffering') && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 8 }}>Loading...</div>
            <div style={{
              width: 40,
              height: 40,
              border: '3px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        </div>
      )}

      {/* Remuxing overlay */}
      {status === 'remuxing' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fff',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <div style={{ marginBottom: 16, fontSize: 14 }}>
              Converting stream for playback...
            </div>
            <div style={{
              width: '100%',
              height: 6,
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${remuxProgress * 100}%`,
                height: '100%',
                backgroundColor: '#4ade80',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              {Math.round(remuxProgress * 100)}%
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fff',
        }}>
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ color: '#f87171', marginBottom: 8, fontSize: 18 }}>
              Playback Error
            </div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>
              {error || 'Unknown error'}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});

export default UniversalPlayer;
