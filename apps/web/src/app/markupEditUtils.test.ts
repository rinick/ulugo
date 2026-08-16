import {describe, expect, it} from 'vitest';
import {addMarkup, createNewGame, getNodeAtPath} from '@ulugo/sgf-core';
import {applyMarkupEdit} from './markupEditUtils';

const connectedBoardOrder = [
  'cc',
  'bc',
  'dc',
  'cb',
  'cd',
  'ac',
  'bb',
  'bd',
  'ec',
  'db',
  'dd',
  'ca',
  'ce',
  'ab',
  'ad',
  'ba',
  'be',
  'eb',
  'ed',
  'da',
  'de',
  'aa',
  'ae',
  'ea',
  'ee',
];

describe('markup connected regions', () => {
  it('draws a large connected stone region in breadth-first order', () => {
    const document = createNewGame(5);
    const stones = new Map(connectedBoardOrder.map((point): [string, 'B'] => [point, 'B']));
    const result = applyMarkupEdit({
      document,
      path: [],
      point: 'cc',
      clickCount: 2,
      rightClick: false,
      tool: 'circle',
      labelText: 'A',
      stones,
      boardSize: 5,
      previousAction: null,
      autoIncrementText: false,
    });

    expect(getNodeAtPath(result!.document, []).data.CR).toEqual(connectedBoardOrder);
  });

  it('erases a large connected markup region with shared neighbor paths', () => {
    const document = connectedBoardOrder.reduce(
      (current, point) => addMarkup(current, [], 'CR', point),
      createNewGame(5)
    );
    const result = applyMarkupEdit({
      document,
      path: [],
      point: 'cc',
      clickCount: 2,
      rightClick: false,
      tool: 'erase',
      labelText: 'A',
      stones: new Map(),
      boardSize: 5,
      previousAction: null,
      autoIncrementText: false,
    });

    expect(getNodeAtPath(result!.document, []).data.CR).toBeUndefined();
  });
});
