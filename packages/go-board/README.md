# @ulugo/go-board

React and TypeScript Go board renderer for the Ulugo SGF editor.

This package uses the original SabakiHQ board rendering model and visual behavior, adapted to React and Ulugo CSS class names. The source is TypeScript/TSX; there are no generated `.d.ts` shims or JavaScript source files in this workspace package.

## Exports

- `Board`
- `BoardProps`
- board data types such as `Vertex`, `Marker`, `HotZone`, and `AnalysisOverlay`

Import the stylesheet separately:

```ts
import '@ulugo/go-board/css/board.css';
```

## Development

Run package typechecking:

```sh
pnpm --filter @ulugo/go-board typecheck
```

Run the package test script:

```sh
pnpm --filter @ulugo/go-board test
```

Build verification for the main app:

```sh
pnpm --filter @ulugo/web build
```

## Upstream

This package is based on SabakiHQ's original board renderer. Future upstream changes should be converted or adapted in this TypeScript React fork.
