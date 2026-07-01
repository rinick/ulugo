import {describe, expect, it} from 'vitest';
import {addLabel, addMarkup, addMove, createNewGame, parseSgf} from '@ulugo/sgf-core';
import {deriveBoardPosition, isLegalMove} from '.';

describe('go-core', () => {
  it('derives stones from moves', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const second = addMove(first.document, first.path, 'W', 'pp');

    const position = deriveBoardPosition(second.document, second.path);

    expect(position.stones.get('dd')).toBe('B');
    expect(position.stones.get('pp')).toBe('W');
    expect(position.moveNumber).toBe(2);
  });

  it('treats old out-of-board SGF move points as pass moves', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[tt];W[dd])');
    const position = deriveBoardPosition(document, [0, 0]);

    expect(position.moveNumber).toBe(2);
    expect(position.lastMove).toBe('dd');
    expect(position.stones.has('tt')).toBe(false);
    expect(position.stones.get('dd')).toBe('W');
  });

  it('uses PL on setup nodes as the next color', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];PL[B]AW[pp])');

    expect(deriveBoardPosition(document, [0, 0]).nextColor).toBe('B');
  });

  it('derives labels and markup from the current node', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    let document = addMarkup(first.document, first.path, 'CR', 'dd');
    document = addLabel(document, first.path, 'pp', 'A');

    const point = deriveBoardPosition(document, first.path).points.find((item) => item.point === 'pp');
    expect(point?.label).toBe('A');
  });

  it('captures surrounded stones', () => {
    let result = addMove(createNewGame(), [], 'B', 'bc');
    result = addMove(result.document, result.path, 'W', 'cc');
    result = addMove(result.document, result.path, 'B', 'cb');
    result = addMove(result.document, result.path, 'W', 'qq');
    result = addMove(result.document, result.path, 'B', 'dc');
    result = addMove(result.document, result.path, 'W', 'rr');
    result = addMove(result.document, result.path, 'B', 'cd');

    const position = deriveBoardPosition(result.document, result.path);
    expect(position.stones.has('cc')).toBe(false);
    expect(position.captures.B).toBe(1);
  });

  it('rejects suicide moves outside New Zealand rules', () => {
    let result = addMove(createNewGame(5), [], 'W', 'ab');
    result = addMove(result.document, result.path, 'W', 'ba');
    result = addMove(result.document, result.path, 'W', 'cb');
    result = addMove(result.document, result.path, 'W', 'bc');

    const position = deriveBoardPosition(result.document, result.path);

    expect(isLegalMove(position, 'B', 'bb', 'Japanese')).toBe(false);
  });

  it('allows New Zealand suicide and credits the opponent capture', () => {
    let document = createNewGame(5);
    document.root.data.RU = ['New Zealand'];
    let result = addMove(document, [], 'W', 'ab');
    result = addMove(result.document, result.path, 'W', 'ba');
    result = addMove(result.document, result.path, 'W', 'cb');
    result = addMove(result.document, result.path, 'W', 'bc');

    expect(isLegalMove(deriveBoardPosition(result.document, result.path), 'B', 'bb', 'New Zealand')).toBe(true);

    result = addMove(result.document, result.path, 'B', 'bb');
    const position = deriveBoardPosition(result.document, result.path);

    expect(position.stones.has('bb')).toBe(false);
    expect(position.captures.W).toBe(1);
  });

  it('removes the connected group on New Zealand suicide', () => {
    let document = createNewGame(5);
    document.root.data.RU = ['New Zealand'];
    let result = addMove(document, [], 'B', 'cb');
    result = addMove(result.document, result.path, 'B', 'bc');
    result = addMove(result.document, result.path, 'W', 'ca');
    result = addMove(result.document, result.path, 'W', 'db');
    result = addMove(result.document, result.path, 'W', 'bb');
    result = addMove(result.document, result.path, 'W', 'ba');
    result = addMove(result.document, result.path, 'W', 'ac');
    result = addMove(result.document, result.path, 'W', 'bd');
    result = addMove(result.document, result.path, 'W', 'dc');
    result = addMove(result.document, result.path, 'W', 'cd');
    result = addMove(result.document, result.path, 'B', 'cc');

    const position = deriveBoardPosition(result.document, result.path);

    expect(position.stones.has('cb')).toBe(false);
    expect(position.stones.has('bc')).toBe(false);
    expect(position.stones.has('cc')).toBe(false);
    expect(position.captures.W).toBe(3);
  });
});
