# Trimi

**Trimi is now free and open source.** A focused video editor that runs in your browser. Import your own videos, trim and split clips, crop, adjust color and speed, mute audio, and export MP4 or GIF. All tools are available without an account, activation key, or backend.

- Editor: https://editor.trimi.app/
- Website: https://trimi.app/
- Source and issues: https://github.com/atormo/trimi

## Run locally

Use Node.js 22.12+ and npm.

```sh
git clone https://github.com/atormo/trimi.git
cd trimi/app
npm ci
npm run dev
```

Open the local address printed by Vite. No environment variables or API credentials are required.

## Build and check

From `app/`:

```sh
npm run lint
npm run build
npm run preview
```

Deploy `app/dist/` to a static host using HTTPS. Video decoding and export depend on browser codec support; a current Chromium-based browser is recommended. Large videos also depend on available device memory. Video editing and export happen locally; imported videos are not uploaded to a server. The hosted page can request fonts and the optional sample video.

Or build the included Nginx image from the repository root:

```sh
docker build -t trimi ./app
docker run --rm -p 8080:80 trimi
```

## Project layout

- `app/src/components/`: editor controls, video stage, and timeline
- `app/src/hooks/useVideoEditor.ts`: editor state and import handling
- `app/src/lib/export-engine/`: local MP4/GIF encoding
- `design/`: original design references

## Contributing

Issues and pull requests are welcome. Describe the problem and steps to reproduce it. For code changes, run lint and build, and check the affected editing/import/export flow with a small local video. Never commit credentials or private media.

## License and credits

Trimi's original code is available under the [MIT license](LICENSE). Dependencies retain their own licenses. The included wolf sample by Nicky Pe retains the Pexels license; see [sample credits](app/public/sample-wolf-source.txt). The MIT license does not relicense third-party media or dependencies.
