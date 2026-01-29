/**
 * FFmpeg Remuxer Service
 * Handles remuxing of MKV/AVI/etc to fMP4 for browser playback
 *
 * IMPORTANT: For true streaming, we use a chunked approach where possible.
 * For containers like MKV that need full header parsing, we may need to
 * buffer more data before playback can start.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

class RemuxerService {
  constructor() {
    this.ffmpeg = null;
    this.loaded = false;
    this.loading = false;
    this.loadPromise = null;
    this.onProgress = null;
    this.onLog = null;
  }

  /**
   * Initialize FFmpeg with WASM files
   * Uses CDN for WASM files to avoid bundling issues
   */
  async load() {
    if (this.loaded) return;
    if (this.loading) return this.loadPromise;

    this.loading = true;
    this.loadPromise = this._doLoad();

    try {
      await this.loadPromise;
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  async _doLoad() {
    this.ffmpeg = new FFmpeg();

    // Set up logging
    this.ffmpeg.on('log', ({ message }) => {
      if (this.onLog) {
        this.onLog(message);
      }
      // Parse progress from FFmpeg output
      this._parseProgress(message);
    });

    this.ffmpeg.on('progress', ({ progress, time }) => {
      if (this.onProgress) {
        this.onProgress({ progress, time });
      }
    });

    // Load FFmpeg with multi-threaded core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.9/dist/esm';

    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });
  }

  _parseProgress(message) {
    // Parse time from FFmpeg output like "time=00:01:30.00"
    const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    if (timeMatch && this.onProgress) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseFloat(timeMatch[3]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      this.onProgress({ time: totalSeconds, message });
    }
  }

  /**
   * Remux a file to fragmented MP4
   * This is the batch approach - downloads entire file first
   * Suitable for VOD content or when seeking is needed
   */
  async remuxToFmp4(url, inputFormat = 'mkv') {
    await this.load();

    const inputName = `input.${inputFormat}`;
    const outputName = 'output.mp4';

    // Fetch and write the input file
    const inputData = await fetchFile(url);
    await this.ffmpeg.writeFile(inputName, inputData);

    // Remux to fragmented MP4 (copy codecs - no transcoding)
    await this.ffmpeg.exec([
      '-i', inputName,
      '-c', 'copy',                           // Copy all streams (no transcoding)
      '-f', 'mp4',                             // Output format
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // Fragmented MP4 flags
      outputName,
    ]);

    // Read the output
    const data = await this.ffmpeg.readFile(outputName);

    // Cleanup
    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile(outputName);

    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  /**
   * Remux for streaming using pipe output
   * This attempts to produce fMP4 chunks as data becomes available
   */
  async remuxStreamingFmp4(url, inputFormat = 'mkv', onChunk) {
    await this.load();

    const inputName = `input.${inputFormat}`;

    // For streaming, we'll use a segmented approach
    // Write input file (unfortunately FFmpeg.wasm needs the full input for seeking containers)
    const inputData = await fetchFile(url);
    await this.ffmpeg.writeFile(inputName, inputData);

    // Create multiple segments for streaming playback
    // This allows playback to start sooner
    await this.ffmpeg.exec([
      '-i', inputName,
      '-c', 'copy',
      '-f', 'segment',
      '-segment_time', '4',                    // 4 second segments
      '-segment_format', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-reset_timestamps', '1',
      'segment_%03d.mp4',
    ]);

    // Read segments and call onChunk for each
    const segments = [];
    let segmentIndex = 0;

    while (true) {
      const segmentName = `segment_${String(segmentIndex).padStart(3, '0')}.mp4`;
      try {
        const segmentData = await this.ffmpeg.readFile(segmentName);
        const blob = new Blob([segmentData.buffer], { type: 'video/mp4' });
        segments.push(blob);

        if (onChunk) {
          onChunk(blob, segmentIndex);
        }

        await this.ffmpeg.deleteFile(segmentName);
        segmentIndex++;
      } catch {
        // No more segments
        break;
      }
    }

    // Cleanup input
    await this.ffmpeg.deleteFile(inputName);

    return segments;
  }

  /**
   * Get media info without full remuxing
   * Useful for detecting codecs before deciding on playback strategy
   */
  async getMediaInfo(url, inputFormat = 'mkv') {
    await this.load();

    const inputName = `input.${inputFormat}`;

    // Fetch just the beginning of the file for quick analysis
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-1048576' }, // First 1MB
    });

    let inputData;
    if (response.status === 206) {
      // Partial content supported
      inputData = new Uint8Array(await response.arrayBuffer());
    } else {
      // Fall back to full fetch
      inputData = await fetchFile(url);
    }

    await this.ffmpeg.writeFile(inputName, inputData);

    // Capture FFprobe-like output
    let output = '';
    const originalLog = this.onLog;
    this.onLog = (msg) => {
      output += msg + '\n';
    };

    try {
      // Run FFmpeg with just input analysis
      await this.ffmpeg.exec([
        '-i', inputName,
        '-f', 'null',
        '-',
      ]);
    } catch {
      // FFmpeg exits with error when no output, but we have the info
    }

    this.onLog = originalLog;
    await this.ffmpeg.deleteFile(inputName);

    return this._parseMediaInfo(output);
  }

  _parseMediaInfo(output) {
    const info = {
      duration: null,
      videoCodec: null,
      audioCodec: null,
      width: null,
      height: null,
      bitrate: null,
    };

    // Parse duration
    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    if (durationMatch) {
      info.duration =
        parseInt(durationMatch[1]) * 3600 +
        parseInt(durationMatch[2]) * 60 +
        parseFloat(durationMatch[3]);
    }

    // Parse video stream
    const videoMatch = output.match(/Stream.*Video: (\w+).*?(\d+)x(\d+)/);
    if (videoMatch) {
      info.videoCodec = videoMatch[1];
      info.width = parseInt(videoMatch[2]);
      info.height = parseInt(videoMatch[3]);
    }

    // Parse audio stream
    const audioMatch = output.match(/Stream.*Audio: (\w+)/);
    if (audioMatch) {
      info.audioCodec = audioMatch[1];
    }

    // Parse bitrate
    const bitrateMatch = output.match(/bitrate: (\d+) kb\/s/);
    if (bitrateMatch) {
      info.bitrate = parseInt(bitrateMatch[1]) * 1000;
    }

    return info;
  }

  /**
   * Check if FFmpeg is ready
   */
  isReady() {
    return this.loaded;
  }

  /**
   * Terminate FFmpeg worker
   */
  async terminate() {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
      this.loaded = false;
    }
  }
}

// Singleton instance
export const remuxer = new RemuxerService();
export default RemuxerService;
