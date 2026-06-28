import {addMove, createNewGame, parseSgf, updateGameInfo} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {buildKataGoQuery, normalizeKomi, normalizeRules} from '.';

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

  it('targets the current turn by default', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const second = addMove(first.document, first.path, 'W', 'pp');
    const query = buildKataGoQuery(second.document, {id: 'test', path: second.path});

    expect(query.analyzeTurns).toEqual([2]);
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

  it('uses PL as KataGo initial player after setup', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];PL[B]AW[pp])');
    const query = buildKataGoQuery(document, {id: 'test', path: [0, 0]});

    expect(query.initialPlayer).toBe('B');
    expect(query.moves).toEqual([]);
  });
});
