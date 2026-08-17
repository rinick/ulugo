# Ulugo

<p align="center">
  <img src="/apps/web/src/assets/logo-512.webp" alt="Ulugo logo"/><br>
  <img src="/apps/web/src/assets/wulu-512.webp"/>
</p>

Ulugo is an offline AI review tool for Go/Weiqi, and it can also be used as an sgf editor.

- Download latest version form [Releases Page](https://github.com/rinick/ulugo/releases/latest) 
- Download from [Mirosoft Store](https://apps.microsoft.com/detail/9mtflxctfhxq). 
- Web version is also availible at [ulugo.com](https://ulugo.com), includes all features except AI review.

## Features

#### Review Mode
- Review games with KataGo analysis
- Show top moves and territories
![](/screenshot/review.webp)

### Go Server Support
- Directly open game record from online game servers
  - Fox Weiqi
  - Tygem
  - KGS
  - Pandanet
  - OGS
- Save and open game record from Google Drive
![](/screenshot/open-from.webp)

#### Edit Mode
- Open, edit, and save SGF game records
- Work with SGF markup and comments
![](/screenshot/edit.webp)

#### Minimal Mode
- Focus on the board, hide unecessary UI elements
![](/screenshot/minimal.webp)

#### Board Recognition
- Recognize a Go board position from an image and convert it into an editable SGF game record
![](/screenshot/scan.webp)

#### Hot Zone
- Highlight the critical areas on the board.
- Blue squares: Areas to secure. You may lose these areas if you make a mistake.
- Gray squares: Areas to sacrifice. You will likely need to give up these areas in order to secure the blue ones.
![](/screenshot/hot-zone.webp)


## Development

Requires [Node.js](https://nodejs.org/en/download)

Start electron app.
```sh
npm install
npm dev:electron
```

## Acknowledgements

This project is inspired by [KaTrain](https://github.com/sanderland/katrain), [Sabaki](https://github.com/SabakiHQ/Sabaki), and [KataGo](https://github.com/lightvector/KataGo). It would not have been possible without their excellent work.
