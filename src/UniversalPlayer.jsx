// src/UniversalPlayer.jsx
import { useEffect, useRef } from 'react';
import shaka from 'shaka-player';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export const UniversalPlayer = ({ url, type }) => {
    const videoRef = useRef(null);
    const ffmpegRef = useRef(new FFmpeg());

    useEffect(() => {
        const init = async () => {
            const ffmpeg = ffmpegRef.current;
            await ffmpeg.load();

            // 1. Create Shaka Player instance
            const player = new shaka.Player(videoRef.current);

            if (['mkv', 'avi', 'ts'].includes(type)) {
                // 2. LOGIC: Transmux to fMP4 via FFmpeg
                // We write the remote file to FFmpeg's virtual FS
                await ffmpeg.writeFile('input.mkv', await fetchFile(url));

                // Run remuxing command (copying codecs is fast!)
                await ffmpeg.exec(['-i', 'input.mkv', '-codec', 'copy', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov', 'output.mp4']);

                const data = await ffmpeg.readFile('output.mp4');
                const blob = new Blob([data.buffer], { type: 'video/mp4' });
                const mediaUrl = URL.createObjectURL(blob);

                await player.load(mediaUrl);
            } else {
                // Standard HLS/MP4/DASH path
                await player.load(url);
            }
        };

        init();
    }, [url, type]);

    return <video ref={videoRef} style={{ width: '100%' }} controls />;
};