import {createElement as h} from 'react';
import type {CSSProperties} from 'react';
import {alpha} from './helper';

interface CoordXProps {
  style?: CSSProperties;
  xs: number[];
  coordX?: (x: number) => string | number;
}

interface CoordYProps {
  style?: CSSProperties;
  height: number;
  ys: number[];
  coordY?: (y: number) => string | number;
}

export function CoordX({style, xs, coordX = (i) => alpha[i] || alpha[alpha.length - 1]}: CoordXProps) {
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

    xs.map((i) => h('div', {key: i, style: {width: '1em'}}, h('span', {style: {display: 'block'}}, coordX(i))))
  );
}

export function CoordY({style, height, ys, coordY = (i) => height - i}: CoordYProps) {
  return h(
    'div',
    {
      className: 'ulugo-coordy',
      style: {
        textAlign: 'center',
        ...style,
      },
    },

    ys.map((i) => h('div', {key: i, style: {height: '1em'}}, h('span', {style: {display: 'block'}}, coordY(i))))
  );
}
