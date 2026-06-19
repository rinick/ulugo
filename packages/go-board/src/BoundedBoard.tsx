import {createElement as h, Component} from 'react';
import type {CSSProperties, HTMLAttributes} from 'react';
import Board, {type BoardProps} from './Board';

export type BoundedBoardProps = Omit<BoardProps, 'vertexSize'> & {
  maxWidth: number;
  maxHeight: number;
  maxVertexSize?: number;
  onResized?: () => void;
};

interface BoundedBoardState {
  vertexSize: number;
  visibility: CSSProperties['visibility'];
}

export default class BoundedBoard extends Component<BoundedBoardProps, BoundedBoardState> {
  private element: HTMLElement | null = null;

  constructor(props: BoundedBoardProps) {
    super(props);

    this.state = {
      vertexSize: 1,
      visibility: 'hidden',
    };
  }

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate(prevProps: Partial<BoundedBoardProps> = {}) {
    let {
      showCoordinates,
      maxWidth,
      maxHeight,
      maxVertexSize,
      rangeX,
      rangeY,
      signMap = [],
      onResized = () => {},
    } = this.props;

    if (
      this.state.visibility !== 'visible' ||
      showCoordinates !== prevProps.showCoordinates ||
      maxWidth !== prevProps.maxWidth ||
      maxHeight !== prevProps.maxHeight ||
      maxVertexSize !== prevProps.maxVertexSize ||
      JSON.stringify(rangeX) !== JSON.stringify(prevProps.rangeX) ||
      JSON.stringify(rangeY) !== JSON.stringify(prevProps.rangeY) ||
      signMap.length !== (prevProps.signMap || []).length ||
      (signMap[0] || []).length !== ((prevProps.signMap || [])[0] || []).length
    ) {
      if (this.element == null) return;

      let {offsetWidth, offsetHeight} = this.element;
      let scale = Math.min(maxWidth / offsetWidth, maxHeight / offsetHeight);
      let vertexSize = Math.max(Math.floor(this.state.vertexSize * scale), 1);

      if (this.state.vertexSize !== vertexSize) {
        this.setState({vertexSize}, onResized);
      }

      if (this.state.visibility !== 'visible') {
        this.setState({visibility: 'visible'});
      }
    }
  }

  render() {
    let {innerProps = {}, style = {}, maxVertexSize = Infinity} = this.props;
    let innerRef = innerProps.ref;
    let ref = typeof innerRef === 'function' ? innerRef : () => {};

    return h(Board, {
      ...this.props,

      innerProps: {
        ...innerProps,
        ref: (el: HTMLElement | null) => (ref(el), (this.element = el)),
      } as HTMLAttributes<HTMLElement>,

      style: {
        visibility: this.state.visibility,
        ...style,
      },

      vertexSize: Math.min(this.state.vertexSize, maxVertexSize),
    });
  }
}
