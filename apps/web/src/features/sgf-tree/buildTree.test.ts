import {parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {buildTree} from './buildTree';

describe('SGF tree building', () => {
  it('shows old out-of-board pass moves as pass', () => {
    const tree = buildTree(parseSgf('(;GM[1]SZ[19];B[tt])'))[0];
    expect(tree.children[0]).toMatchObject({point: '', label: 'B1 pass'});
  });

  it('gives setup nodes their own tree step after moves', () => {
    const tree = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];AB[pq];W[pp])'))[0];
    expect(tree.children[0].moveNumber).toBe(1);
    expect(tree.children[0].children[0]).toMatchObject({moveNumber: 2, isSetup: true, setupColor: 'B'});
    expect(tree.children[0].children[0].children[0].moveNumber).toBe(3);
  });

  it('colors setup nodes opposite to the next player instead of their stones', () => {
    const whiteToPlay = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];AW[pq]PL[W])'))[0].children[0].children[0];
    const blackToPlay = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];AB[pq]PL[B])'))[0].children[0].children[0];

    expect(whiteToPlay.setupColor).toBe('B');
    expect(blackToPlay.setupColor).toBe('W');
  });

  it.each([
    ['a handicap', '(;GM[1]SZ[19]HA[2]AB[pd]AW[dp])', 'B'],
    ['a black-only root setup', '(;GM[1]SZ[19]AB[pd][dp])', 'B'],
    ['an explicit Black player', '(;GM[1]SZ[19]HA[2]AB[pd][dp]PL[B])', 'W'],
    ['a mixed root setup', '(;GM[1]SZ[19]AB[pd]AW[dp])', 'W'],
  ] as const)('infers the setup color for %s', (_name, sgf, setupColor) => {
    expect(buildTree(parseSgf(sgf))[0].setupColor).toBe(setupColor);
  });

  it('keeps only an empty move-zero setup gray', () => {
    const emptyRoot = buildTree(parseSgf('(;GM[1]SZ[19]PL[W])'))[0];
    const occupiedRoot = buildTree(parseSgf('(;GM[1]SZ[19]AB[dd]AW[pp])'))[0];
    const emptyLaterSetup = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];AE[dd])'))[0].children[0].children[0];

    expect(emptyRoot).toMatchObject({isSetup: true, setupColor: null});
    expect(occupiedRoot).toMatchObject({isSetup: true, setupColor: 'W'});
    expect(emptyLaterSetup).toMatchObject({isSetup: true, setupColor: 'B'});
  });

  it('gives final scoring nodes their own tree step without global result color', () => {
    const scoringNode = buildTree(parseSgf('(;GM[1]SZ[19]RE[B+2.5];B[dd];W[tt];TW[pp]TB[dp])'))[0].children[0]
      .children[0].children[0];

    expect(scoringNode).toMatchObject({moveNumber: 3, isScoring: true, scoreColor: null});
  });

  it('uses scoring node result for score node color', () => {
    const scoringNode = buildTree(parseSgf('(;GM[1]SZ[19]RE[B+2.5];B[dd];W[tt];TW[pp]TB[dp]RE[W+1.5])'))[0].children[0]
      .children[0].children[0];

    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: 'W'});
  });

  it('uses scoring node points for score node color', () => {
    const scoringNode = buildTree(parseSgf('(;GM[1]SZ[19]KM[0]RE[B+2.5];B[dd];TW[pp])'))[0].children[0].children[0];

    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: 'W'});
  });

  it('uses AGA pass stones for score node color', () => {
    const scoringNode = buildTree(parseSgf('(;GM[1]SZ[19]KM[0]RU[AGA];B[];TB[]TW[])'))[0].children[0].children[0];
    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: 'W'});
  });

  it('does not use pass stones for score node color outside AGA rules', () => {
    const scoringNode = buildTree(parseSgf('(;GM[1]SZ[19]KM[0]RU[Japanese];B[];TB[]TW[])'))[0].children[0].children[0];
    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: null});
  });

  it('uses initial capture counts for score node color', () => {
    const tree = buildTree(parseSgf('(;GM[1]SZ[19]KM[0]RU[Japanese]XBC[1]XWC[0];TB[]TW[])'))[0];
    expect(tree.children[0]).toMatchObject({isScoring: true, scoreColor: 'B'});
  });

  it('uses captured connected groups for score node color', () => {
    const document = parseSgf('(;SZ[5]KM[0];W[aa];W[ab];W[ba];W[bb];B[ac];B[bc];B[ca];B[cb];TB[]TW[])');
    let scoringNode = buildTree(document)[0];
    for (let index = 0; index < 9; index += 1) scoringNode = scoringNode.children[0];

    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: 'B'});
  });

  it('keeps a group with liberties when the move touches it from two sides', () => {
    const scoringNode = buildTree(parseSgf('(;SZ[5]KM[1.5];W[aa];W[ab];W[ba];B[bb];TB[aa]TW[])'))[0].children[0]
      .children[0].children[0].children[0].children[0];

    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: 'B'});
  });

  it.each(['New Zealand', 'Tromp-Taylor'])('removes suicidal groups under %s rules when scoring the tree', (rules) => {
    const document = parseSgf(
      `(;SZ[5]KM[0]RU[${rules}];B[cb];B[bc];W[ca];W[db];W[bb];W[ba];W[ac];W[bd];W[dc];W[cd];B[cc];TB[]TW[])`
    );
    let scoringNode = buildTree(document)[0];
    while (scoringNode.children.length > 0) scoringNode = scoringNode.children[0];

    expect(scoringNode).toMatchObject({isScoring: true, scoreColor: 'W'});
  });

  it('keeps the existing territory formula for area-rule tree colors', () => {
    const scoringNode = buildTree(parseSgf('(;SZ[3]KM[0]RU[Chinese]AB[aa]AW[ca]XWC[3];TB[ba]TW[])'))[0].children[0];
    expect(scoringNode.scoreColor).toBe('W');
  });

  it('marks camera setup nodes and preserves setup next-player colors', () => {
    const camera = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];PL[W]AB[aa]AW[bb]ZA[camera])'))[0].children[0].children[0];
    const blackToPlay = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];PL[B]AW[pp])'))[0].children[0].children[0];

    expect(camera).toMatchObject({isSetup: true, isCameraSetup: true, setupColor: 'B'});
    expect(blackToPlay.setupColor).toBe('W');
  });
});
