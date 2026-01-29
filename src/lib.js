/**
 * m3u-player Library Entry Point
 * Exports components and utilities for use in other projects
 */

// Main player component
export { default as UniversalPlayer } from './components/UniversalPlayer';

// State management
export { PlayerProvider, usePlayer } from './context/PlayerContext';

// Utilities
export {
  detectStreamType,
  StreamType,
  StreamCategory,
  isLiveStream,
  needsRemuxing,
  isShakaCompatible,
  getExtension,
} from './utils/streamDetector';

// Services
export { remuxer, default as RemuxerService } from './services/RemuxerService';

// Convenience function to create a player instance on a DOM element
export function createPlayer(container, options = {}) {
  const { url, autoPlay = false, onReady, onError, ...rest } = options;

  // Dynamic import of React to avoid bundling issues
  return import('react').then(async (React) => {
    const { createRoot } = await import('react-dom/client');
    const { default: UniversalPlayer } = await import('./components/UniversalPlayer');
    const { PlayerProvider } = await import('./context/PlayerContext');

    const root = createRoot(container);

    let playerRef = null;

    const PlayerWrapper = () => {
      const ref = React.useRef(null);

      React.useEffect(() => {
        playerRef = ref.current;
        if (onReady && ref.current) {
          onReady(ref.current);
        }
      }, []);

      return React.createElement(
        PlayerProvider,
        null,
        React.createElement(UniversalPlayer, {
          ref,
          url,
          autoPlay,
          onError,
          ...rest,
        })
      );
    };

    root.render(React.createElement(PlayerWrapper));

    return {
      root,
      getPlayer: () => playerRef,
      destroy: () => root.unmount(),
      load: (newUrl) => {
        // Re-render with new URL
        root.render(
          React.createElement(
            PlayerProvider,
            null,
            React.createElement(UniversalPlayer, {
              url: newUrl,
              autoPlay,
              onError,
              ...rest,
            })
          )
        );
      },
    };
  });
}

// Version
export const VERSION = '0.1.0';
