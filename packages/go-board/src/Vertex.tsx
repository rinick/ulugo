import {createElement as h, memo, useCallback} from 'react';
import type {CSSProperties, MouseEvent, PointerEvent} from 'react';
import classnames from 'classnames';

import {vertexEvents, type Vertex as VertexPoint, type VertexEventName} from './helper';
import Marker, {type Marker as MarkerData} from './Marker';

type Sign = 0 | -1 | 1;
type VertexHandlerEvent = MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>;
export type VertexHandler = (evt: VertexHandlerEvent, vertex: VertexPoint) => void;

export interface AnalysisOverlay {
  strength: number;
  halo?: boolean;
  dot?: boolean;
  dotSize?: number;
  text?: string | number | null;
}

export interface MoveHint {
  best?: boolean;
  branch?: 'main' | 'variation';
  sign?: Sign;
}

export interface HotZone {
  type: 'gain' | 'loss';
  opacity: number;
}

export type VertexEventHandlers = Partial<Record<`on${VertexEventName}`, VertexHandler>>;

export interface VertexProps extends VertexEventHandlers {
  position: VertexPoint;
  random?: number;
  sign?: Sign;
  futureStone?: boolean;
  analysisOverlay?: AnalysisOverlay | null;
  moveHint?: MoveHint | null;
  ownership?: number;
  marker?: MarkerData | null;
  hotZone?: HotZone | null;
  selected?: boolean;
  selectedLeft?: boolean;
  selectedRight?: boolean;
  selectedTop?: boolean;
  selectedBottom?: boolean;
}

const absoluteStyle = (): CSSProperties => ({
  position: 'absolute',
});

function Vertex(props: VertexProps) {
  let {
    position,
    random,
    sign = 0,
    futureStone,
    analysisOverlay,
    moveHint,
    ownership = 0,
    marker,
    hotZone,
    selected,
    selectedLeft,
    selectedRight,
    selectedTop,
    selectedBottom,
  } = props;

  let eventHandlers: Partial<Record<VertexEventName, (evt: VertexHandlerEvent) => void>> = {};

  for (let eventName of vertexEvents) {
    eventHandlers[eventName] = useCallback(
      (evt: VertexHandlerEvent) => {
        props[`on${eventName}`]?.(evt, position);
      },
      [...position, props[`on${eventName}`]]
    );
  }

  let ownershipOpacity = Math.abs(ownership);

  let markerMarkup = () =>
    !!marker &&
    h(Marker, {
      key: 'marker',
      sign,
      type: marker.type,
      label: marker.label,
    });

  return h(
    'div',
    Object.assign(
      {
        'data-x': position[0],
        'data-y': position[1],

        'style': {
          position: 'relative',
        } satisfies CSSProperties,
        'className': classnames('ulugo-vertex', `ulugo-random_${random}`, `ulugo-sign_${sign}`, {
          [`ulugo-analysis-strength_${analysisOverlay?.strength}`]: (analysisOverlay?.strength ?? 0) > 0,
          'ulugo-bestmove': !!moveHint?.best,
          [`ulugo-nextmove_${moveHint?.branch}`]: !!moveHint?.branch,
          [`ulugo-nextmove-sign_${moveHint?.sign}`]: !!moveHint?.sign,

          [`ulugo-ownership_${ownership > 0 ? 1 : -1}`]: !!ownership,

          'ulugo-selected': selected,
          'ulugo-selectedleft': selectedLeft,
          'ulugo-selectedright': selectedRight,
          'ulugo-selectedtop': selectedTop,
          'ulugo-selectedbottom': selectedBottom,

          [`ulugo-marker_${marker?.type}`]: !!marker?.type,
          'ulugo-smalllabel':
            marker?.type === 'label' && ((marker.label ?? '').includes('\n') || (marker.label ?? '').length >= 3),
          [`ulugo-hot-zone_${hotZone?.type}`]: !!hotZone,
        }),
      },
      ...vertexEvents.map((eventName) => ({
        [`on${eventName}`]: eventHandlers[eventName],
      }))
    ),
    h('div', {
      key: 'analysisOverlay',
      className: classnames('ulugo-analysis-overlay', {
        [`ulugo-analysis-strength_${analysisOverlay?.strength}`]:
          (analysisOverlay?.halo ?? true) && (analysisOverlay?.strength ?? 0) > 0,
      }),
      style: absoluteStyle(),
    }),

    !!hotZone &&
      h('div', {
        key: 'hotZone',
        className: 'ulugo-hot-zone',
        style: {
          ...absoluteStyle(),
          '--ulugo-hot-zone-opacity': hotZone.opacity,
        } as CSSProperties,
      }),

    h(
      'div',
      {key: 'stone', className: classnames('ulugo-stone', {'ulugo-future-stone': futureStone}), style: absoluteStyle()},

      !!sign &&
        h(
          'div',
          {
            key: 'inner',
            className: classnames('ulugo-inner', 'ulugo-stone-image', `ulugo-random_${random}`, `ulugo-sign_${sign}`),
            style: absoluteStyle(),
          },
          sign
        )
    ),

    !!ownership &&
      h('div', {
        key: 'ownership',
        className: 'ulugo-ownership',
        style: {
          ...absoluteStyle(),
          '--ulugo-ownership-opacity': ownershipOpacity,
        } as CSSProperties,
      }),

    !!moveHint?.best &&
      h('div', {
        key: 'bestmove',
        className: 'ulugo-movehint ulugo-movehint-best',
        style: absoluteStyle(),
      }),

    moveHint?.branch != null &&
      h('div', {
        key: 'nextmove',
        className: 'ulugo-movehint ulugo-movehint-next',
        style: absoluteStyle(),
      }),

    !!analysisOverlay?.dot &&
      h('div', {
        key: 'analysisDot',
        className: classnames('ulugo-analysis-dot', {
          [`ulugo-analysis-strength_${analysisOverlay?.strength}`]: (analysisOverlay?.strength ?? 0) > 0,
        }),
        style: {
          ...absoluteStyle(),
          '--ulugo-analysis-dot-size': analysisOverlay.dotSize == null ? undefined : `${analysisOverlay.dotSize}em`,
          '--ulugo-analysis-dot-offset':
            analysisOverlay.dotSize == null ? undefined : `${-analysisOverlay.dotSize / 2}em`,
        } as CSSProperties,
      }),

    markerMarkup(),

    !!selected &&
      h('div', {
        key: 'selection',
        className: 'ulugo-selection',
        style: absoluteStyle(),
      }),
    analysisOverlay?.text != null &&
      h(
        'div',
        {
          key: 'analysisLabel',
          className: classnames('ulugo-analysis-label', {
            'ulugo-analysis-label_multiline': analysisOverlay.text.toString().includes('\n'),
          }),
          style: absoluteStyle(),
        },
        analysisOverlay.text && analysisOverlay.text.toString()
      )
  );
}

export default memo(Vertex, sameVertexProps);

function sameVertexProps(previous: VertexProps, next: VertexProps): boolean {
  return (
    previous.position[0] === next.position[0] &&
    previous.position[1] === next.position[1] &&
    previous.random === next.random &&
    previous.sign === next.sign &&
    previous.futureStone === next.futureStone &&
    sameAnalysisOverlay(previous.analysisOverlay, next.analysisOverlay) &&
    sameMoveHint(previous.moveHint, next.moveHint) &&
    sameMarker(previous.marker, next.marker) &&
    sameHotZone(previous.hotZone, next.hotZone) &&
    previous.ownership === next.ownership &&
    previous.selected === next.selected &&
    previous.selectedLeft === next.selectedLeft &&
    previous.selectedRight === next.selectedRight &&
    previous.selectedTop === next.selectedTop &&
    previous.selectedBottom === next.selectedBottom &&
    vertexEvents.every((eventName) => previous[`on${eventName}`] === next[`on${eventName}`])
  );
}

function sameAnalysisOverlay(
  left: AnalysisOverlay | null | undefined,
  right: AnalysisOverlay | null | undefined
): boolean {
  return (
    left === right ||
    (left != null &&
      right != null &&
      left.strength === right.strength &&
      left.halo === right.halo &&
      left.dot === right.dot &&
      left.dotSize === right.dotSize &&
      left.text === right.text)
  );
}

function sameMoveHint(left: MoveHint | null | undefined, right: MoveHint | null | undefined): boolean {
  return (
    left === right ||
    (left != null &&
      right != null &&
      left.best === right.best &&
      left.branch === right.branch &&
      left.sign === right.sign)
  );
}

function sameMarker(left: MarkerData | null | undefined, right: MarkerData | null | undefined): boolean {
  return left === right || (left != null && right != null && left.type === right.type && left.label === right.label);
}

function sameHotZone(left: HotZone | null | undefined, right: HotZone | null | undefined): boolean {
  return (
    left === right || (left != null && right != null && left.type === right.type && left.opacity === right.opacity)
  );
}
