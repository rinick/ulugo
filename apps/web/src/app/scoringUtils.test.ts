import type {BoardPosition, Stone} from '@ulugo/go-core';
import {vertexToPoint, type SgfPoint} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {estimateScoringPoints, toggleScoringGroup} from './scoringUtils';

describe('scoringUtils', () => {
  it('splits empty regions at tunnel points for ownership', () => {
    const position = boardPosition([
      'BBBBBBB',
      'B.BBB.B',
      'BBB.BBB',
      'BBB.BBB',
      'WWW.WWW',
      'W.WWW.W',
      'WWWWWWW',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toContain('dc');
    expect(scoring.blackPoints).not.toContain('dd');
    expect(scoring.whitePoints).toContain('de');
    expect(scoring.whitePoints).not.toContain('dd');
  });

  it('assigns tunnel points when all neighboring stones resolve to the tunnel owner', () => {
    const position = boardPosition([
      'BBBBB',
      'BB.BB',
      'BB.BB',
      'BB.BB',
      'BBBBB',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['cb', 'cc', 'cd']));
    expect(scoring.whitePoints).not.toContain('cc');
  });

  it('assigns single empty regions surrounded by tunnels from 8-neighbor colors', () => {
    const position = boardPosition([
      '.....',
      '.B.B.',
      '.....',
      '.B.B.',
      '.....',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toContain('cc');
  });

  it('does not assign tunnel points unless an open side belongs to the tunnel owner', () => {
    const position = boardPosition([
      '..W..',
      '.B.B.',
      '.B.B.',
      '.B.B.',
      '..W..',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).not.toContain('cc');
  });

  it('assigns connected same-owner tunnel groups without side ownership', () => {
    const position = boardPosition([
      '..W...',
      '.B.B..',
      '.B.B..',
      '.B.B..',
      '.B.B..',
      '..W...',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['cc', 'cd']));
  });

  it('separates empty regions at one-side tunnel points', () => {
    const position = boardPosition([
      'BBBBBBBBB',
      'BBBWWWWWB',
      'B..W.W.WB',
      'BBBWWWWWB',
      'BBBBBBBBB',
      'B.BBBBBBB',
      'BBBBBBBBB',
      'B.BBBBBBB',
      'BBBBBBBBB',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toContain('bc');
    expect(scoring.blackPoints).not.toContain('cc');
  });

  it('marks one-liberty groups dead when neighboring opponent groups have more liberties', () => {
    const position = boardPosition([
      '.....',
      '.WWW.',
      '.WBW.',
      '.W.W.',
      '..B..',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toContain('cc');
  });

  it('keeps estimate groups connected through a single diagonal cut when the far corner is not opponent', () => {
    const position = boardPosition([
      '..W..',
      '.WBW.',
      '.B...',
      '.....',
      '....B',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).not.toContain('cb');
  });

  it('cuts estimate groups through a single diagonal cut when the far corner is opponent', () => {
    const position = boardPosition([
      '..W..',
      '.WBW.',
      '.B...',
      '...W.',
      '....B',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toContain('cb');
  });

  it('cuts estimate groups through a single diagonal cut when a side point is opponent', () => {
    const position = boardPosition([
      '..W..',
      '.WBW.',
      '.B.W.',
      '.....',
      '....B',
    ]);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toContain('cb');
  });

  it('toggles live and death using the same diagonal grouping rule', () => {
    const position = boardPosition([
      '..W..',
      '.WBW.',
      '.B...',
      '.....',
      '....B',
    ]);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {}, children: []}, 'cb');

    expect(scoring?.whitePoints).toEqual(expect.arrayContaining(['cb', 'bc']));
  });
});

function boardPosition(rows: string[]): BoardPosition {
  const stones = new Map<SgfPoint, Stone>();

  rows.forEach((row, y) => {
    [...row].forEach((value, x) => {
      if (value === 'B' || value === 'W') stones.set(vertexToPoint(x, y), value);
    });
  });

  return {
    size: rows.length,
    points: [],
    stones,
    captures: {B: 0, W: 0},
    nextColor: 'B',
    lastMove: null,
    moveNumber: 0,
  };
}
