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

  it('ignores malformed move points without adding invisible stones', () => {
    const document = parseSgf('(;GM[1]SZ[5];B[x];W[aa])');
    const malformedPosition = deriveBoardPosition(document, [0]);
    const position = deriveBoardPosition(document, [0, 0]);

    expect(malformedPosition).toMatchObject({moveNumber: 1, nextColor: 'W', lastMove: null});
    expect(malformedPosition.stones.size).toBe(0);
    expect(position.stones).toEqual(new Map([['aa', 'W']]));
  });

  it('ignores malformed and out-of-board setup points', () => {
    const document = parseSgf('(;GM[1]SZ[5]AB[aa][ff][x][aa:bb]AW[ee][zz][abc])');
    const position = deriveBoardPosition(document, []);

    expect(position.stones).toEqual(
      new Map([
        ['aa', 'B'],
        ['ee', 'W'],
      ])
    );
  });

  it('credits AGA pass stones to the opponent', () => {
    const document = parseSgf('(;GM[1]SZ[19]RU[AGA];B[];W[])');
    const position = deriveBoardPosition(document, [0, 0]);

    expect(position.captures.B).toBe(1);
    expect(position.captures.W).toBe(1);
  });

  it('does not credit pass stones outside AGA rules', () => {
    const document = parseSgf('(;GM[1]SZ[19]RU[Japanese];B[];W[])');
    const position = deriveBoardPosition(document, [0, 0]);

    expect(position.captures.B).toBe(0);
    expect(position.captures.W).toBe(0);
  });

  it('starts from capture counts stored on a recognized position', () => {
    const document = parseSgf('(;GM[1]SZ[19]XBC[3]XWC[1]AB[dd]AW[pp])');
    const position = deriveBoardPosition(document, []);

    expect(position.captures).toEqual({B: 3, W: 1});
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

  it('captures connected groups with shared neighbors', () => {
    const document = parseSgf('(;SZ[5];W[aa];W[ab];W[ba];W[bb];B[ac];B[bc];B[ca];B[cb])');
    const position = deriveBoardPosition(document, Array<number>(8).fill(0));

    expect(position.captures.B).toBe(4);
    expect(['aa', 'ab', 'ba', 'bb'].every((point) => !position.stones.has(point))).toBe(true);
  });

  it('keeps a group with liberties when the move touches it from two sides', () => {
    const document = parseSgf('(;SZ[5];W[aa];W[ab];W[ba];B[bb])');
    const position = deriveBoardPosition(document, Array<number>(4).fill(0));

    expect(position.captures.B).toBe(0);
    expect([...position.stones.entries()]).toEqual([
      ['aa', 'W'],
      ['ab', 'W'],
      ['ba', 'W'],
      ['bb', 'B'],
    ]);
  });

  it('rejects suicide moves outside New Zealand rules', () => {
    let result = addMove(createNewGame(5), [], 'W', 'ab');
    result = addMove(result.document, result.path, 'W', 'ba');
    result = addMove(result.document, result.path, 'W', 'cb');
    result = addMove(result.document, result.path, 'W', 'bc');

    const position = deriveBoardPosition(result.document, result.path);

    expect(isLegalMove(position, 'B', 'bb', 'Japanese')).toBe(false);
  });

  it.each(['New Zealand', 'Tromp-Taylor'])('allows suicide under %s and credits the opponent capture', (rules) => {
    let document = createNewGame(5);
    document.root.data.RU = [rules];
    let result = addMove(document, [], 'W', 'ab');
    result = addMove(result.document, result.path, 'W', 'ba');
    result = addMove(result.document, result.path, 'W', 'cb');
    result = addMove(result.document, result.path, 'W', 'bc');

    expect(isLegalMove(deriveBoardPosition(result.document, result.path), 'B', 'bb', rules)).toBe(true);

    result = addMove(result.document, result.path, 'B', 'bb');
    const position = deriveBoardPosition(result.document, result.path);

    expect(position.stones.has('bb')).toBe(false);
    expect(position.captures.W).toBe(1);
  });

  it.each(['New Zealand', 'Tromp-Taylor'])('removes the connected group on %s suicide', (rules) => {
    let document = createNewGame(5);
    document.root.data.RU = [rules];
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
