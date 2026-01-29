/**
 * Stream type detection utility
 * Detects the type of media stream from URL, headers, or content
 */

export const StreamType = {
  HLS: 'hls',
  DASH: 'dash',
  MP4: 'mp4',
  WEBM: 'webm',
  MPEG_TS: 'ts',
  MKV: 'mkv',
  AVI: 'avi',
  UNKNOWN: 'unknown',
};

export const StreamCategory = {
  NATIVE: 'native',      // Shaka can handle directly
  LIVE: 'live',          // Live streaming content
  REMUX: 'remux',        // Needs FFmpeg remuxing
};

/**
 * Detect stream type from URL
 */
export function detectStreamType(url) {
  if (!url) return { type: StreamType.UNKNOWN, category: StreamCategory.NATIVE };

  const urlLower = url.toLowerCase();
  const pathname = new URL(url, window.location.origin).pathname.toLowerCase();

  // Check for HLS
  if (urlLower.includes('.m3u8') || urlLower.includes('format=m3u8')) {
    return { type: StreamType.HLS, category: StreamCategory.LIVE };
  }

  // Check for DASH
  if (urlLower.includes('.mpd')) {
    return { type: StreamType.DASH, category: StreamCategory.LIVE };
  }

  // Check for MPEG-TS (often live streams)
  if (pathname.endsWith('.ts') || urlLower.includes('format=ts')) {
    return { type: StreamType.MPEG_TS, category: StreamCategory.LIVE };
  }

  // Check for native formats
  if (pathname.endsWith('.mp4') || pathname.endsWith('.m4v')) {
    return { type: StreamType.MP4, category: StreamCategory.NATIVE };
  }

  if (pathname.endsWith('.webm')) {
    return { type: StreamType.WEBM, category: StreamCategory.NATIVE };
  }

  // Check for formats that need remuxing
  if (pathname.endsWith('.mkv')) {
    return { type: StreamType.MKV, category: StreamCategory.REMUX };
  }

  if (pathname.endsWith('.avi')) {
    return { type: StreamType.AVI, category: StreamCategory.REMUX };
  }

  // Default to unknown - will try native playback first
  return { type: StreamType.UNKNOWN, category: StreamCategory.NATIVE };
}

/**
 * Detect if URL is likely a live stream
 */
export function isLiveStream(url, type) {
  if (!url) return false;

  const urlLower = url.toLowerCase();

  // HLS and DASH are typically live (or VOD with segments)
  if (type === StreamType.HLS || type === StreamType.DASH) {
    return true;
  }

  // Raw TS streams are often live
  if (type === StreamType.MPEG_TS) {
    // Check for live stream indicators in URL
    if (urlLower.includes('live') ||
        urlLower.includes('stream') ||
        urlLower.includes(':8080') ||
        urlLower.includes(':8000')) {
      return true;
    }
    return true; // Assume TS is live by default
  }

  return false;
}

/**
 * Get file extension from URL
 */
export function getExtension(url) {
  if (!url) return '';
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase().split('?')[0];
    return ext || '';
  } catch {
    return '';
  }
}

/**
 * Determine if format needs remuxing to play in browser
 */
export function needsRemuxing(type) {
  return [StreamType.MKV, StreamType.AVI].includes(type);
}

/**
 * Determine if Shaka Player can handle this format natively
 */
export function isShakaCompatible(type) {
  return [
    StreamType.HLS,
    StreamType.DASH,
    StreamType.MP4,
    StreamType.WEBM,
  ].includes(type);
}
