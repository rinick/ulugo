import {addMove, createNewGame, parseSgf, updateGameInfo} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {buildKataGoQuery, normalizeKomi, normalizeRules, usesAreaValueOffset} from '.';

describe('katago-core', () => {
  it('uses Japanese rules and 6.5 komi when game info is missing', () => {
    const document = updateGameInfo(createNewGame(), {KM: '', RU: ''});
    const query = buildKataGoQuery(document, {id: 'test', path: []});

    expect(query.komi).toBe(6.5);
    expect(query.rules).toBe('japanese');
  });

  it('normalizes komi to KataGo-compatible half-integers', () => {
    expect(normalizeKomi('7,5')).toBe(7.5);
    expect(normalizeKomi('7.25')).toBe(7.5);
    expect(normalizeKomi('375')).toBe(7.5);
    expect(normalizeKomi('')).toBe(6.5);
    expect(normalizeKomi(Number.NaN)).toBe(6.5);
  });

  it('normalizes supported rule names', () => {
    expect(normalizeRules('Japanese')).toBe('japanese');
    expect(normalizeRules('New Zealand')).toBe('new-zealand');
    expect(normalizeRules('')).toBe('japanese');
  });

  it('identifies rules whose move values include a one-point area-scoring offset', () => {
    expect(usesAreaValueOffset('Chinese')).toBe(true);
    expect(usesAreaValueOffset('New Zealand')).toBe(true);
    expect(usesAreaValueOffset('Japanese')).toBe(false);
  });

  it('targets the current turn by default', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const second = addMove(first.document, first.path, 'W', 'pp');
    const query = buildKataGoQuery(second.document, {id: 'test', path: second.path});

    expect(query.analyzeTurns).toEqual([2]);
    expect(query.includePolicy).toBe(false);
  });

  it('allows callers to omit ownership data', () => {
    const query = buildKataGoQuery(createNewGame(), {id: 'test', path: [], includeOwnership: false});

    expect(query.includeOwnership).toBe(false);
  });

  it('merges history before mid-game setup into KataGo initial stones', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];W[pd];AB[qq]AE[dd];B[cc])');
    const query = buildKataGoQuery(document, {id: 'test', path: [0, 0, 0, 0]});

    expect(query.initialStones).toEqual(
      expect.arrayContaining([
        ['W', 'Q16'],
        ['B', 'R3'],
      ])
    );
    expect(query.initialStones).toHaveLength(2);
    expect(query.initialPlayer).toBe('B');
    expect(query.moves).toEqual([['B', 'C17']]);
    expect(query.analyzeTurns).toEqual([1]);
  });

  it('removes captured connected groups before a mid-game setup', () => {
    const document = parseSgf('(;SZ[5];W[aa];W[ab];W[ba];W[bb];B[ac];B[bc];B[ca];B[cb];PL[B]AB[ee])');
    const query = buildKataGoQuery(document, {id: 'test', path: Array<number>(9).fill(0)});

    expect(query.initialStones).toEqual(
      expect.arrayContaining([
        ['B', 'A3'],
        ['B', 'B3'],
        ['B', 'C5'],
        ['B', 'C4'],
        ['B', 'E1'],
      ])
    );
    expect(query.initialStones).toHaveLength(5);
  });

  it('keeps a group with liberties when a move touches it from two sides before setup', () => {
    const document = parseSgf('(;SZ[5];W[aa];W[ab];W[ba];B[bb];PL[W]AB[ee])');
    const query = buildKataGoQuery(document, {id: 'test', path: Array<number>(5).fill(0)});

    expect(query.initialStones).toEqual([
      ['W', 'A5'],
      ['W', 'A4'],
      ['W', 'B5'],
      ['B', 'B4'],
      ['B', 'E1'],
    ]);
  });

  it.each(['New Zealand', 'Tromp-Taylor'])(
    'removes suicidal groups under %s rules before a mid-game setup',
    (rules) => {
      const document = parseSgf(
        `(;SZ[5]RU[${rules}];B[cb];B[bc];W[ca];W[db];W[bb];W[ba];W[ac];W[bd];W[dc];W[cd];B[cc];PL[W]AB[ee])`
      );
      const query = buildKataGoQuery(document, {id: 'test', path: Array<number>(12).fill(0)});

      expect(query.initialStones.filter(([color]) => color === 'B')).toEqual([['B', 'E1']]);
    }
  );

  it('keeps moves before ordinary games when no setup node is present', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];W[pp])');
    const query = buildKataGoQuery(document, {id: 'test', path: [0, 0]});

    expect(query.initialStones).toEqual([]);
    expect(query.initialPlayer).toBe('B');
    expect(query.moves).toEqual([
      ['B', 'D16'],
      ['W', 'Q4'],
    ]);
    expect(query.analyzeTurns).toEqual([2]);
  });

  it('sends old out-of-board SGF move points to KataGo as pass', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[tt];W[dd])');
    const query = buildKataGoQuery(document, {id: 'test', path: [0, 0]});

    expect(query.moves).toEqual([
      ['B', 'pass'],
      ['W', 'D16'],
    ]);
  });

  it('uses PL as KataGo initial player after setup', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];PL[B]AW[pp])');
    const query = buildKataGoQuery(document, {id: 'test', path: [0, 0]});

    expect(query.initialPlayer).toBe('B');
    expect(query.moves).toEqual([]);
  });
});
