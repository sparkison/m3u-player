# m3u player

![logo](./public/favicon.png)

**Universal media player with FFmpeg remuxing and Shaka Player support (HLS, DASH, MP4, MKV, AVI, MPEG-TS).**

---

## Features ✅

- Universal playback: HLS, DASH, MP4, WEBM, MPEG-TS
- FFmpeg (WASM) remuxing for MKV/AVI to fragmented MP4 (fMP4)
- Shaka Player integration for adaptive streaming
- React component (`UniversalPlayer`) and non-React embedding (`createPlayer`)
- Player state management via `PlayerProvider` and `usePlayer`
- Exports utilities for stream detection and remuxer service

---

## Quick install

Install from npm (or use a local path for development):

```bash
npm install m3u-player
# or, from this repo (local):
# npm install ../path/to/m3u-player
```

> Note: `react` and `react-dom` are optional peer dependencies; they're required if you import the React component directly. `createPlayer` dynamically imports React, so it can be used in environments where you prefer lazy loading.

---

## Usage (React)

Import the CSS, then import the component:

```js
import 'm3u-player/style.css';
import { UniversalPlayer } from 'm3u-player';

function MyPlayer() {
  return (
    <UniversalPlayer
      url="https://example.com/video.m3u8"
      autoPlay={false}
      controls={true}
      onReady={({ player, video }) => console.log('ready', player, video)}
    />
  );
}
```

Props highlights:
- `url` (string) — media URL
- `autoPlay`, `muted`, `controls`, `loop`, `poster`
- Event callbacks: `onReady`, `onPlay`, `onPause`, `onTimeUpdate`, `onEnded`, `onError`, `onBuffering`, `onStreamInfo`, `onRemuxProgress`

You can also use `PlayerProvider` and `usePlayer` for shared state across components.

---

## Usage (Non-React / DOM)

You can embed the player into a plain DOM container using `createPlayer`:

```js
import { createPlayer } from 'm3u-player';

const container = document.getElementById('player');
(async () => {
  const instance = await createPlayer(container, {
    url: 'https://example.com/video.mkv',
    autoPlay: true,
    onReady: (playerRef) => console.log('player ready', playerRef),
    onError: (err) => console.error(err),
  });

  // instance has methods: getPlayer(), load(newUrl), destroy()
})();
```

---

## Programmatic API

Exports you may find useful:

- `UniversalPlayer` — React component
- `PlayerProvider`, `usePlayer` — state management
- `remuxer` / `RemuxerService` — FFmpeg remuxing utilities (`remuxToFmp4`, `remuxStreamingFmp4`, `getMediaInfo`)
- `detectStreamType`, `needsRemuxing`, `isShakaCompatible`, `getExtension` — helpers
- `createPlayer(container, options)` — mount player on a DOM element
- `VERSION` — package version

Example: Using the remuxer directly

```js
import { remuxer } from 'm3u-player';

// get media info
const info = await remuxer.getMediaInfo('https://example.com/video.mkv', 'mkv');
console.log(info);

// remux to fMP4 (returns a Blob)
const blob = await remuxer.remuxToFmp4('https://example.com/video.mkv', 'mkv');
const url = URL.createObjectURL(blob);
// set `url` on a <video> element
```

---

## Using the ES module build in another Vite project ⚙️

The library ships an ES module build at `dist/m3u-player.es.js` and the package's `module` field points to this file, so modern bundlers (Vite, Rollup, webpack with ESM) will pick it automatically.

Examples

1) Vite + React (recommended)

```js
// src/App.jsx
import 'm3u-player/style.css';
import { UniversalPlayer } from 'm3u-player';

export default function App() {
  return <UniversalPlayer url="https://example.com/video.m3u8" />;
}
```

2) Direct ESM import from a CDN (for experimentation)

```html
<script type="module">
  import { UniversalPlayer } from 'https://unpkg.com/m3u-player@0.1.0/dist/m3u-player.es.js';
  // You must also provide React/ReactDOM (e.g., via CDN ESM) and any required polyfills
</script>
```

Tips & troubleshooting

- CSS: import `m3u-player/style.css` in your app to include the packaged styles.
- Duplicate React / Hooks errors: if you see errors about multiple copies of React, make sure your app and `m3u-player` resolve the same React instance. A simple fix in Vite is to add an alias that dedupes React:

```js
// vite.config.js
import { resolve } from 'path';
export default {
  resolve: {
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
  },
};
```

- @ffmpeg assets: FFmpeg core WASM files are loaded from a CDN by default (`RemuxerService`). For private networks or offline use, host the core files locally and update `RemuxerService` to point to your hosted files.
- Need an alternate bundle without React included? Open an issue or PR — we can provide an additional build variant that treats `react`/`react-dom` as externals.

---

## Development

Clone the repository and install dependencies:

```bash
git clone git@github.com:sparkison/m3u-player.git
cd m3u-player
npm install
```

Useful scripts (from `package.json`):

- `npm run dev` — run the Vite dev server (demo)
- `npm run build` — build the library (LIB mode)
- `npm run build:demo` — build the demo app
- `npm run build:all` — build library + demo
- `npm run preview` / `npm run preview:demo` — preview built output
- `npm run lint` — lint the codebase

Open http://localhost:5173 when running `npm run dev`.

---

## Notes & Limitations ⚠️

- FFmpeg runs in the browser via WASM and is loaded from a CDN (configured in `RemuxerService`); offline or private deployments may need to host the core files locally.
- Remuxing can be network- and CPU-intensive, and for some containers (e.g., MKV) the remuxer may need the whole file before producing playable fragments.
- Cross-origin requests require proper CORS headers; large file downloads will be affected by browser network limits.
- HLS is played natively on Safari/iOS; Shaka Player is used on other browsers for HLS/DASH.

---

## Contributing

Contributions are welcome! Please open issues for bugs or feature requests, and submit PRs for fixes.

- Follow the repo style and run `npm run lint` before opening a PR

---

## ⚖️ License  

> m3u player is licensed under **CC BY-NC-SA 4.0**:  

- **BY**: Give credit where credit’s due.  
- **NC**: No commercial use.  
- **SA**: Share alike if you remix.  

For full license details, see [LICENSE](https://creativecommons.org/licenses/by-nc-sa/4.0/).
