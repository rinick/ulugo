import {createElement as h, useMemo} from 'react';
import type {Vertex} from './helper';

interface GridProps {
  width: number;
  height: number;
  xs: number[];
  ys: number[];
  hoshis: Vertex[];
  hoshiRadius: number;
}

export default function Grid(props: GridProps) {
  let {width, height, xs, ys, hoshis, hoshiRadius} = props;

  return useMemo(
    () =>
      xs.length > 0 &&
      ys.length > 0 &&
      h(
        'svg',
        {
          className: 'ulugo-grid',
          viewBox: `0 0 ${xs.length} ${ys.length}`,
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 0,
          },
        },

        // Draw grid lines

        ys.map((_, i) => {
          let x1 = xs[0] === 0 ? 0.5 : 0;
          let x2 = xs[xs.length - 1] === width - 1 ? xs.length - 0.5 : xs.length;

          return h('line', {
            key: `h${i}`,

            className: 'ulugo-gridline ulugo-horizontal',
            x1,
            y1: i + 0.5,
            x2,
            y2: i + 0.5,
            vectorEffect: 'non-scaling-stroke',
          });
        }),

        xs.map((_, i) => {
          let y1 = ys[0] === 0 ? 0.5 : 0;
          let y2 = ys[ys.length - 1] === height - 1 ? ys.length - 0.5 : ys.length;

          return h('line', {
            key: `v${i}`,

            className: 'ulugo-gridline ulugo-vertical',
            x1: i + 0.5,
            y1,
            x2: i + 0.5,
            y2,
            vectorEffect: 'non-scaling-stroke',
          });
        }),

        // Draw hoshi points

        hoshis.map(([x, y]) => {
          let i = xs.indexOf(x);
          let j = ys.indexOf(y);
          if (i < 0 || j < 0) return;

          return h('circle', {
            key: [x, y].join('-'),

            className: 'ulugo-hoshi',
            cx: i + 0.5,
            cy: j + 0.5,
            r: hoshiRadius,
          });
        })
      ),
    [width, height, xs.length, ys.length, xs[0], ys[0], hoshiRadius]
  );
}
