import {createElement as h} from 'react';
import type {CSSProperties} from 'react';
import {alpha} from './helper';

interface CoordXProps {
  style?: CSSProperties;
  xs: number[];
}

interface CoordYProps {
  style?: CSSProperties;
  height: number;
  ys: number[];
}

export function CoordX({style, xs}: CoordXProps) {
  return h(
    'div',
    {
      className: 'ulugo-coordx',
      style: {
        display: 'flex',
        textAlign: 'center',
        ...style,
      },
    },

    xs.map((i) =>
      h('div', {key: i, style: {width: '1em'}}, h('span', {style: {display: 'block'}}, alpha[i] || alpha[alpha.length - 1]))
    )
  );
}

export function CoordY({style, height, ys}: CoordYProps) {
  return h(
    'div',
    {
      className: 'ulugo-coordy',
      style: {
        textAlign: 'center',
        ...style,
      },
    },

    ys.map((i) => h('div', {key: i, style: {height: '1em'}}, h('span', {style: {display: 'block'}}, height - i)))
  );
}
