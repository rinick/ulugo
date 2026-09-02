import type {BoardPosition, Stone} from '@ulugo/go-core';
import {parseSgf, vertexToPoint, type SgfPoint} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {analyzeScoringPosition} from './analysis';
import {scoringPointsForDeadStones} from './territory';
import {estimateScoringPoints, scoringSummaryForNode, toggleScoringGroup} from './index';

describe('scoring', () => {
  it('estimates surrounded empty points as territory', () => {
    const position = boardPosition(['BBBBB', 'B...B', 'B...B', 'B...B', 'BBBBB']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['bb', 'cc', 'dd']));
    expect(scoring.whitePoints).toHaveLength(0);
  });

  it('estimates surrounded white territory', () => {
    const position = boardPosition(['WWWWW', 'W...W', 'W...W', 'W...W', 'WWWWW']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toEqual(expect.arrayContaining(['bb', 'cc', 'dd']));
    expect(scoring.blackPoints).toHaveLength(0);
  });

  it('leaves balanced influence unassigned', () => {
    const position = boardPosition(['B...W', '.....', '.....', '.....', 'W...B']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).not.toContain('cc');
    expect(scoring.whitePoints).not.toContain('cc');
  });

  it('uses nearest stone distance for otherwise undetermined empty points', () => {
    const position = boardPosition(['BB...WW', 'BB...WW', '.......', '.......', '.......', '.......', '.......']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toContain('ca');
    expect(scoring.whitePoints).toContain('ea');
  });

  it('uses dead stones as opponent nearest-stone distance sources', () => {
    const position = boardPosition(['BB...B.', 'BB.....', '.......', '.......', '.......', '.......', '.......']);
    const scoring = scoringPointsForDeadStones(position, {black: new Set(['fa']), white: new Set()});

    expect(scoring.whitePoints).toContain('fa');
    expect(scoring.whitePoints).toContain('ea');
  });

  it('fills unassigned empty groups surrounded by one owned color', () => {
    const position = boardPosition(['BBBBBBB', 'B.....B', 'B.....B', 'B.....W', 'B.....B', 'B.....B', 'BBBBBBB']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['cd', 'dd', 'ed']));
  });

  it('fills locally surrounded empty points with at most two unassigned neighbors', () => {
    const position = boardPosition(['BBB', 'B..', 'BBB']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toContain('bb');
  });

  it('does not assign liberties of non-dead groups to the opponent', () => {
    const position = boardPosition([
      '.........WBBBB.BWW.',
      '.........WWBBBB.BW.',
      '...W..WW.WBBWBBBBW.',
      '....WWB.W.WWWB.BWW.',
      '...WBBB.W..WWWBBBW.',
      '.WW.WWBBBWWBWWWBW.W',
      'WBBWWBB..BBBBWWBWWB',
      '.WB.WB..BBWWBBWBWBB',
      '.W.BWBWWBWBWWWWWWBB',
      '..WWBBWBBWBBBW.WWWB',
      'WWBBWWBBW...WBWWBBB',
      'WBBBW.WWBBB.BBWWWB.',
      'BB.BWWWWWWBBBW.WBB.',
      '..BWWBWBWWWBWWWWWB.',
      '..BWWBWBBWWBWWBWB..',
      'BBBWWBBBWBBWWBBWB..',
      'BWWWWB.WW..BBB.BB..',
      'W.WWBBBBWB.........',
      '.WWBB.WWBB.........',
    ]);

    const scoring = estimateScoringPoints(position);
    const analysis = analyzeScoringPosition(position, {black: new Set(), white: new Set()});
    const j3Group = analysis.groups.find((group) => group.points.includes('iq'));

    expect(j3Group?.status).not.toBe('dead');
    expect(scoring.blackPoints).not.toContain('jq');
  });

  it('marks one-liberty groups dead when neighboring opponent groups have more liberties', () => {
    const position = boardPosition(['.....', '.WWW.', '.WBW.', '.W.W.', '..B..']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toContain('cc');
  });

  it('does not treat a single shared liberty as seki', () => {
    const position = boardPosition(['WWWWW', 'WW.WW', 'WWBWW', 'WWWWW', '.....']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toContain('cc');
  });

  it('marks surrounded one-eye groups dead', () => {
    const position = boardPosition(['.......', '.BBBBB.', '.BWWWB.', '.BW.WB.', '.BW.WB.', '.BBBBB.', '.......']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['cc', 'dc', 'ec', 'cd', 'ed', 'ce', 'ee']));
  });

  it('keeps sizeable one-eye groups with several liberties alive', () => {
    const position = boardPosition(['WWWWWWW', 'WBBBB.W', 'WB.BB.W', 'WBBBB.W', 'W.....W', 'WWWWWWW', '.......']);

    const scoring = estimateScoringPoints(position);

    for (const point of ['bb', 'cb', 'db', 'eb', 'bc', 'dc', 'ec']) {
      expect(scoring.whitePoints).not.toContain(point);
    }
  });

  it('keeps the R19 black group alive in a late-game corner fight', () => {
    const position = boardPosition([
      '...BBW......WBBBB..',
      '...BWW......WWBWBW.',
      '...BBWWWW..W.WWWBW.',
      '..BWWWBBBWW.WWWBBBB',
      '..BWBB.BWWBW.W.WB..',
      '..BWWBBBWWBBWWWWB.B',
      'BBBBWBWBBBBBBWBBBBW',
      'WBWBBWWBWBWBWWBBWWW',
      'WWWWBBWWWBWWBBBBBW.',
      '.BWWBWWBBBBWBWBWWW.',
      '.WWWWWBBWWBWBWW....',
      '.WBBWWBBBWWWWWWW..W',
      '..WBBWWWBWBBBW...WW',
      '..WWBBBBBWWBBW.WBWW',
      '..WWWBWWWBWWBWB.WWB',
      '..WWBB.BBBBWBBWWWBB',
      '.W.WWB....BWWBWBBBB',
      '..WBBB.....BBBBWWB.',
      '.WBB.............B.',
    ]);

    const scoring = estimateScoringPoints(position);
    const analysis = analyzeScoringPosition(position, {black: new Set(), white: new Set()});
    const statusAt = (point: SgfPoint) => analysis.groups.find((group) => group.points.includes(point))?.status;

    expect(statusAt('qa')).toBe('alive');
    expect(statusAt('pr')).toBe('dead');
    expect(statusAt('qr')).toBe('dead');
    expect(scoring.whitePoints).not.toContain('qa');
    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['gp', 'pr', 'qr', 'sr', 'ss']));
  });

  it('does not mark seki stones as dead territory', () => {
    const position = boardPosition([
      '.WWWWW..',
      'WWBBBWW.',
      'WBB.BBW.',
      'WB.W.BW.',
      'WB.W.BW.',
      'WBB.BBW.',
      'WWBBBWW.',
      '.WWWWW..',
    ]);

    const scoring = estimateScoringPoints(position);

    for (const point of [
      'cb',
      'db',
      'eb',
      'bc',
      'cc',
      'ec',
      'fc',
      'bd',
      'fd',
      'be',
      'fe',
      'bf',
      'cf',
      'ef',
      'ff',
      'cg',
      'dg',
      'eg',
    ]) {
      expect(scoring.whitePoints).not.toContain(point);
    }

    for (const point of ['dc', 'cd', 'ed', 'ce', 'ee', 'df']) {
      expect(scoring.blackPoints).not.toContain(point);
      expect(scoring.whitePoints).not.toContain(point);
    }
  });

  it('marks small isolated groups dead inside opponent territory', () => {
    const position = boardPosition(['WWWWWWW', 'W.....W', 'W.....W', 'W.BB..W', 'W.....W', 'W.....W', 'WWWWWWW']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.whitePoints).toEqual(expect.arrayContaining(['cd', 'dd']));
  });

  it('marks small isolated white groups dead inside black territory', () => {
    const position = boardPosition(['BBBBBBB', 'B.....B', 'B.....B', 'B.WW..B', 'B.....B', 'B.....B', 'BBBBBBB']);

    const scoring = estimateScoringPoints(position);

    expect(scoring.blackPoints).toEqual(expect.arrayContaining(['cd', 'dd']));
  });

  it('keeps asymmetric seki stones alive', () => {
    const position = boardPosition([
      '..WWWW..',
      'WWWBBW..',
      'WBB.BWW.',
      'WB.WBBW.',
      'WBBW.BW.',
      'WWB.BBW.',
      '.WBBBWW.',
      '.WWWWW..',
    ]);

    const scoring = estimateScoringPoints(position);

    for (const point of [
      'db',
      'eb',
      'bc',
      'cc',
      'ec',
      'bd',
      'ed',
      'fd',
      'be',
      'ce',
      'cf',
      'cg',
      'dg',
      'eg',
      'ef',
      'ff',
      'fe',
    ]) {
      expect(scoring.whitePoints).not.toContain(point);
    }

    for (const point of ['dd', 'de']) {
      expect(scoring.blackPoints).not.toContain(point);
    }

    for (const point of ['dc', 'cd', 'ee', 'df']) {
      expect(scoring.blackPoints).not.toContain(point);
      expect(scoring.whitePoints).not.toContain(point);
    }
  });

  it('does not change the other seki side when toggling one side alive', () => {
    const position = boardPosition([
      '..WWWW..',
      'WWWBBW..',
      'WBB.BWW.',
      'WB.WBBW.',
      'WBBW.BW.',
      'WWB.BBW.',
      '.WBBBWW.',
      '.WWWWW..',
    ]);
    const blackGroup = [
      'db',
      'eb',
      'bc',
      'cc',
      'ec',
      'bd',
      'ed',
      'fd',
      'be',
      'ce',
      'cf',
      'cg',
      'dg',
      'eg',
      'ef',
      'ff',
      'fe',
    ];
    const whiteGroup = ['dd', 'de'];
    const node = {id: 'node', data: {TW: blackGroup, TB: whiteGroup}, children: []};

    const scoring = toggleScoringGroup(position, node, 'db');

    for (const point of blackGroup) {
      expect(scoring?.whitePoints).not.toContain(point);
    }
    for (const point of whiteGroup) {
      expect(scoring?.blackPoints).toContain(point);
    }
  });

  it('uses manual dead-stone marks when recalculating scoring points', () => {
    const position = boardPosition(['WWW', 'WBW', 'WWW']);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {}, children: []}, 'bb');

    expect(scoring?.whitePoints).toContain('bb');
    expect(scoring?.blackPoints).not.toContain('bb');
  });

  it('allows automatically dead stones to be toggled alive', () => {
    const position = boardPosition(['WWW', 'WBW', 'WWW']);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {TW: ['bb']}, children: []}, 'bb');

    expect(scoring?.whitePoints).not.toContain('bb');
  });

  it('keeps estimate groups connected through a single diagonal cut when the far corner is same color', () => {
    const position = boardPosition(['.....', '.WBW.', '.B...', '...B.', '.....']);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {}, children: []}, 'cb');

    expect(scoring?.whitePoints).toEqual(expect.arrayContaining(['cb', 'bc']));
  });

  it('cuts estimate groups through a single diagonal cut when either endpoint group has one liberty', () => {
    const oneLibertyFirstEndpoint = boardPosition(['..W..', '.WBW.', '.B...', '...B.', '.....']);
    const firstEndpointScoring = toggleScoringGroup(
      oneLibertyFirstEndpoint,
      {id: 'node', data: {}, children: []},
      'cb'
    );

    expect(firstEndpointScoring?.whitePoints).toContain('cb');
    expect(firstEndpointScoring?.whitePoints).not.toContain('bc');

    const oneLibertySecondEndpoint = boardPosition(['.....', '.WBW.', 'WB...', '.W.B.', '.....']);
    const secondEndpointScoring = toggleScoringGroup(
      oneLibertySecondEndpoint,
      {id: 'node', data: {}, children: []},
      'cb'
    );

    expect(secondEndpointScoring?.whitePoints).toContain('cb');
    expect(secondEndpointScoring?.whitePoints).not.toContain('bc');
  });

  it('cuts estimate groups through a single diagonal cut when the far corner is empty', () => {
    const position = boardPosition(['..W..', '.WBW.', '.B...', '.....', '.....']);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {}, children: []}, 'cb');

    expect(scoring?.whitePoints).toContain('cb');
    expect(scoring?.whitePoints).not.toContain('bc');
  });

  it('cuts estimate groups through a single diagonal cut when the far corner is opponent', () => {
    const position = boardPosition(['..W..', '.WBW.', '.B...', '...W.', '....B']);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {}, children: []}, 'cb');

    expect(scoring?.whitePoints).toContain('cb');
    expect(scoring?.whitePoints).not.toContain('bc');
  });

  it('cuts estimate groups through a single diagonal cut when a side point is opponent', () => {
    const position = boardPosition(['..W..', '.WBW.', '.B.W.', '.....', '....B']);
    const scoring = toggleScoringGroup(position, {id: 'node', data: {}, children: []}, 'cb');

    expect(scoring?.whitePoints).toContain('cb');
    expect(scoring?.whitePoints).not.toContain('bc');
  });

  it('summarizes Japanese and Korean scores with territory and captures', () => {
    const position = boardPosition(['B.W', '...', '...'], {B: 2, W: 0});
    const node = {id: 'node', data: {TB: ['ba']}, children: []};

    expect(scoringSummaryForNode(parseSgf('(;GM[1]SZ[3]KM[0]RU[Japanese])'), node, position)).toMatchObject({
      blackScore: 3,
      whiteScore: 0,
      result: 'B+3',
    });
    expect(scoringSummaryForNode(parseSgf('(;GM[1]SZ[3]KM[0]RU[Korean])'), node, position)).toMatchObject({
      blackScore: 3,
      whiteScore: 0,
      result: 'B+3',
    });
  });

  it('summarizes non-territory rules with territory and live on-board stones', () => {
    const position = boardPosition(['B.W', '...', '...'], {B: 2, W: 0});
    const node = {id: 'node', data: {TB: ['ba']}, children: []};

    expect(scoringSummaryForNode(parseSgf('(;GM[1]SZ[3]KM[0]RU[Chinese])'), node, position)).toMatchObject({
      blackScore: 2,
      whiteScore: 1,
      result: 'B+1',
    });
    expect(scoringSummaryForNode(parseSgf('(;GM[1]SZ[3]KM[0]RU[AGA])'), node, position)).toMatchObject({
      blackScore: 2,
      whiteScore: 1,
      result: 'B+1',
    });
  });

  it('retains distinct scoring fallbacks for missing and unknown rule names', () => {
    const position = boardPosition(['B.W', '...', '...'], {B: 2, W: 0});
    const node = {id: 'node', data: {TB: ['ba']}, children: []};

    expect(scoringSummaryForNode(parseSgf('(;GM[1]SZ[3]KM[0])'), node, position).result).toBe('B+3');
    expect(scoringSummaryForNode(parseSgf('(;GM[1]SZ[3]KM[0]RU[Mystery])'), node, position).result).toBe('B+1');
  });
});

function boardPosition(rows: string[], captures: Record<Stone, number> = {B: 0, W: 0}): BoardPosition {
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
    captures,
    nextColor: 'B',
    lastMove: null,
    moveNumber: 0,
  };
}
