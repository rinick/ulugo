import {createElement as h, Component} from 'react';
import type {CSSProperties} from 'react';
import classnames from 'classnames';

import {random, vertexEquals, vertexEvents, range, getHoshis, type Vertex as VertexPoint} from './helper';
import {CoordX, CoordY} from './Coord';
import Grid from './Grid';
import Vertex, {type AnalysisOverlay, type HotZone, type MoveHint, type VertexEventHandlers} from './Vertex';
import type {Marker} from './Marker';

export type Vertex = VertexPoint;
export type Map<T> = T[][];
export type {AnalysisOverlay, HotZone, Marker, MoveHint};

type Sign = 0 | -1 | 1;

type PublicVertexEventHandlers = {
  [Key in keyof VertexEventHandlers as Key extends `on${infer Name}`
    ? `onVertex${Name}`
    : never]: VertexEventHandlers[Key];
};

export interface BoardProps extends PublicVertexEventHandlers {
  id?: string;
  class?: string;
  className?: string;
  style?: CSSProperties;
  vertexSize?: number;
  showCoordinates?: boolean;
  signMap?: Map<Sign>;
  extraStoneMap?: Map<boolean>;
  missingStoneMap?: Map<boolean>;
  pastStoneMap?: Map<boolean>;
  futureStoneMap?: Map<boolean>;
  placementPreviewOpacityMap?: Map<number>;
  markerMap?: Map<Marker | null>;
  ownershipMap?: Map<number>;
  hotZoneMap?: Map<HotZone | null>;
  analysisOverlayMap?: Map<AnalysisOverlay | null>;
  moveHintMap?: Map<MoveHint | null>;
  selectedVertices?: VertexPoint[];
}

interface BoardState {
  signMap: Map<Sign>;
  width: number;
  height: number;
  xs: number[];
  ys: number[];
  hoshis: VertexPoint[];
  randomMap: number[][];
}

const emptyState: BoardState = {
  signMap: [],
  width: 0,
  height: 0,
  xs: [],
  ys: [],
  hoshis: [],
  randomMap: [],
};

export default class Board extends Component<BoardProps, BoardState> {
  static getDerivedStateFromProps: (props: BoardProps, state: BoardState) => Partial<BoardState>;

  constructor(props: BoardProps) {
    super(props);

    this.state = emptyState;
  }

  render() {
    let {width, height, xs, ys, hoshis, randomMap} = this.state;

    let {
      vertexSize = 24,
      signMap,
      extraStoneMap,
      missingStoneMap,
      pastStoneMap,
      futureStoneMap,
      placementPreviewOpacityMap,
      ownershipMap,
      hotZoneMap,
      analysisOverlayMap,
      moveHintMap,
      markerMap,
      showCoordinates = false,
      selectedVertices = [],
    } = this.props;

    return h(
      'div',
      {
        id: this.props.id,
        className: classnames(
          'ulugo-board',
          'ulugo-board-image',
          {
            'ulugo-coordinates': showCoordinates,
          },
          this.props.class ?? this.props.className
        ),
        style: {
          display: 'inline-grid',
          gridTemplateRows: showCoordinates ? '1em 1fr 1em' : '1fr',
          gridTemplateColumns: showCoordinates ? '1em 1fr 1em' : '1fr',
          fontSize: vertexSize,
          lineHeight: '1em',
          ...(this.props.style ?? {}),
        },
      },

      showCoordinates && h(CoordX, {xs, style: {gridRow: '1', gridColumn: '2'}}),
      showCoordinates &&
        h(CoordY, {
          height,
          ys,
          style: {gridRow: '2', gridColumn: '1'},
        }),

      h(
        'div',
        {
          className: 'ulugo-content',
          style: {
            position: 'relative',
            width: `${xs.length}em`,
            height: `${ys.length}em`,
            gridRow: showCoordinates ? '2' : '1',
            gridColumn: showCoordinates ? '2' : '1',
          },
        },

        h(Grid, {
          vertexSize,
          width,
          height,
          xs,
          ys,
          hoshis,
        }),

        h(
          'div',
          {
            className: 'ulugo-vertices',
            style: {
              display: 'grid',
              gridTemplateColumns: `repeat(${xs.length}, 1em)`,
              gridTemplateRows: `repeat(${ys.length}, 1em)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
            },
          },

          ys.map((y) =>
            xs.map((x) => {
              let equalsVertex = (v: VertexPoint) => vertexEquals(v, [x, y]);
              let selected = selectedVertices.some(equalsVertex);

              return h(
                Vertex,
                Object.assign(
                  {
                    key: [x, y].join('-'),
                    position: [x, y],

                    random: randomMap?.[y]?.[x],
                    sign: signMap?.[y]?.[x],
                    extraStone: extraStoneMap?.[y]?.[x],
                    missingStone: missingStoneMap?.[y]?.[x],
                    pastStone: pastStoneMap?.[y]?.[x],
                    futureStone: futureStoneMap?.[y]?.[x],
                    placementPreviewOpacity: placementPreviewOpacityMap?.[y]?.[x],

                    analysisOverlay: analysisOverlayMap?.[y]?.[x],
                    moveHint: moveHintMap?.[y]?.[x],
                    marker: markerMap?.[y]?.[x],

                    hotZone: hotZoneMap?.[y]?.[x],
                    ownership: ownershipMap?.[y]?.[x],

                    selected,
                    selectedLeft: selected && selectedVertices.some((v) => vertexEquals(v, [x - 1, y])),
                    selectedRight: selected && selectedVertices.some((v) => vertexEquals(v, [x + 1, y])),
                    selectedTop: selected && selectedVertices.some((v) => vertexEquals(v, [x, y - 1])),
                    selectedBottom: selected && selectedVertices.some((v) => vertexEquals(v, [x, y + 1])),
                  },

                  ...vertexEvents.map((e) => ({
                    [`on${e}`]: this.props[`onVertex${e}`],
                  }))
                )
              );
            })
          )
        )
      ),

      showCoordinates &&
        h(CoordY, {
          height,
          ys,
          style: {gridRow: '2', gridColumn: '3'},
        }),
      showCoordinates && h(CoordX, {xs, style: {gridRow: '3', gridColumn: '2'}})
    );
  }
}

Board.getDerivedStateFromProps = function (props: BoardProps, state: BoardState): Partial<BoardState> {
  let {signMap = []} = props;

  let width = signMap.length === 0 ? 0 : signMap[0].length;
  let height = signMap.length;

  if (state.width === width && state.height === height) {
    return {signMap};
  }

  // Board size changed

  return {
    signMap,
    width,
    height,
    xs: range(width),
    ys: range(height),
    hoshis: getHoshis(width, height),
    randomMap: signMap.map((row) => row.map((_) => random(4))),
  };
};
