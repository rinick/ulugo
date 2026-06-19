# Ulugo

<p align="center">
  <img src="/apps/web/src/assets/logo-512.webp" alt="Ulugo logo"/><br>
  <img src="/apps/web/src/assets/wulu-512.webp"/>
</p>

Ulugo is an offline AI review tool for Go/Weiqi, and it can also be used as an sgf editor.

## Features

- Review games with KataGo analysis in the Electron app.
  - Download from [Releases Page](https://github.com/rinick/ulugo/releases)
- Open, edit, and save SGF game records.
  - Also available as a standalone web app at [ulugo.com](https://ulugo.com).

## Development

Start electron app, and it will automatically download KataGo to analyze games.

```sh
pnpm install
pnpm dev:electron
```

Start web server

```sh
pnpm install
pnpm dev
```

## Acknowledgements

This project is inspired by [KaTrain](https://github.com/sanderland/katrain), [Sabaki](https://github.com/SabakiHQ/Sabaki), and [KataGo](https://github.com/lightvector/KataGo). It would not have been possible without their excellent work.
