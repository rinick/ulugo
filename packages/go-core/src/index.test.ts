import {describe, expect, it} from 'vitest';
import {
  addLabel,
  addMarkup,
  addMove,
  createNewGame,
  parseSgf,
  serializeSgf,
  updateSetupNextColor,
} from '@ulugo/sgf-core';
import {addSetupStone, deriveBoardPosition, isLegalMove, isLocallyLegalMove, ruleProfile} from '.';

const koSetup = 'SZ[5]AB[ab][ba][bc]AW[bb][ca][cc][db]PL[B]';
const rulesWithKo = ['Japanese', 'Chinese', 'Korean', 'AGA', 'New Zealand', 'Tromp-Taylor', 'Stone Scoring', ''];
const rulesWithSuperko = ['AGA', 'New Zealand', 'Tromp-Taylor'];

describe('go-core', () => {
  it('normalizes shared rule behavior while retaining unknown-rule fallbacks', () => {
    expect(ruleProfile('New Zealand')).toMatchObject({key: 'new-zealand', allowSuicide: true});
    expect(ruleProfile('AGA')).toMatchObject({key: 'aga', creditPassStone: true, scoring: 'area'});
    expect(ruleProfile('Mystery')).toMatchObject({key: 'unknown', scoring: 'area'});
    expect(ruleProfile('')).toMatchObject({key: 'unknown', scoring: 'territory'});
  });

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

  it('infers White to play after a black-only root setup', () => {
    const document = parseSgf('(;GM[1]SZ[19]HA[2]AB[pd][dp];W[pp])');

    expect(deriveBoardPosition(document, []).nextColor).toBe('W');
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

    expect(isLocallyLegalMove(position, 'B', 'bb', 'Japanese')).toBe(false);
  });

  it.each(rulesWithKo)('rejects immediate ko recapture under %s rules', (rules) => {
    const position = deriveBoardPosition(parseSgf(`(;${koSetup}RU[${rules}];B[cb])`), [0]);

    expect(isLocallyLegalMove(position, 'W', 'bb', rules)).toBe(true);
    expect(isLegalMove(position, 'W', 'bb', rules)).toBe(false);
    expect(isLegalMove(position, 'W', '', rules)).toBe(true);
    expect(isLegalMove(position, 'W', 'cb', rules)).toBe(false);
    expect(isLegalMove(position, 'W', 'ff', rules)).toBe(false);
  });

  it('does not lift a ko ban when traversing annotation nodes', () => {
    const position = deriveBoardPosition(parseSgf(`(;${koSetup};B[cb];C[Comment];TR[cb])`), [0, 0, 0]);

    expect(isLegalMove(position, 'W', 'bb', 'Japanese')).toBe(false);
  });

  it.each(rulesWithKo)('allows ko recapture after a threat and response under %s rules', (rules) => {
    const document = parseSgf(`(;${koSetup}RU[${rules}];B[cb];W[ee];B[de])`);

    expect(isLegalMove(deriveBoardPosition(document, [0, 0, 0]), 'W', 'bb', rules)).toBe(true);
  });

  it('lifts simple ko after passes', () => {
    const position = deriveBoardPosition(parseSgf(`(;${koSetup};B[cb];W[];B[])`), [0, 0, 0]);

    expect(isLegalMove(position, 'W', 'bb', 'Japanese')).toBe(true);
  });

  it.each(rulesWithSuperko)('keeps the superko ban after passes under %s rules', (rules) => {
    const document = parseSgf(`(;${koSetup}RU[${rules}];B[cb];W[];B[])`);
    const position = deriveBoardPosition(document, [0, 0, 0]);

    expect(isLegalMove(position, 'W', 'bb', rules)).toBe(false);
    expect(isLegalMove(position, 'W', '', rules)).toBe(true);
  });

  it.each(['Japanese', 'Chinese', ...rulesWithSuperko])('checks a triple-ko cycle under %s rules', (rules) => {
    const document = parseSgf(
      `(;SZ[13]RU[${rules}]PL[B]AB[ab][ba][bc][ff][ge][gg][hf][ib][ja][jc]` +
        'AW[bb][ca][cc][db][ef][fe][fg][jb][ka][kc][lb];B[cb];W[gf];B[kb];W[bb];B[ff])'
    );
    const position = deriveBoardPosition(document, [0, 0, 0, 0, 0]);
    const repeated = addMove(document, [0, 0, 0, 0, 0], 'W', 'jb');

    expect(deriveBoardPosition(repeated.document, repeated.path).stones).toEqual(
      deriveBoardPosition(document, []).stones
    );
    expect(isLocallyLegalMove(position, 'W', 'jb', rules)).toBe(true);
    expect(isLegalMove(position, 'W', 'jb', rules)).toBe(!rulesWithSuperko.includes(rules));
  });

  it.each(rulesWithKo)('allows snapback instead of mistaking it for ko under %s rules', (rules) => {
    const document = parseSgf(`(;SZ[5]RU[${rules}]AB[ba][bb]AW[aa][ca][cb][ac][bc]PL[B];B[ab])`);

    expect(isLegalMove(deriveBoardPosition(document, [0]), 'W', 'aa', rules)).toBe(true);
  });

  it.each(rulesWithSuperko)('uses only the current branch history under %s rules', (rules) => {
    const document = parseSgf(`(;SZ[5]RU[${rules}](;B[aa];W[bb];B[cc])(;B[cc];W[bb]))`);

    expect(isLegalMove(deriveBoardPosition(document, [1, 0]), 'B', 'aa', rules)).toBe(true);
  });

  it.each(rulesWithSuperko)('starts a new repetition history after setup edits under %s rules', (rules) => {
    const document = parseSgf(`(;${koSetup}RU[${rules}];B[cb];AE[cb]AW[bb]PL[B])`);

    expect(isLegalMove(deriveBoardPosition(document, [0, 0]), 'B', 'cb', rules)).toBe(true);
  });

  it('includes the next player when checking situational superko', () => {
    const setup = 'SZ[5]PL[B]AW[ab][ba][cb][ac][cc][bd]';
    const nzPosition = deriveBoardPosition(parseSgf(`(;${setup}RU[New Zealand];B[bb];W[])`), [0, 0]);
    const ttPosition = deriveBoardPosition(parseSgf(`(;${setup}RU[Tromp-Taylor];B[bb];W[])`), [0, 0]);

    expect(isLegalMove(nzPosition, 'B', 'bc', 'New Zealand')).toBe(true);
    expect(isLegalMove(ttPosition, 'B', 'bc', 'Tromp-Taylor')).toBe(false);
  });

  it.each(['New Zealand', 'Tromp-Taylor'])(
    'rejects a suicide that leaves the board unchanged under %s rules',
    (rules) => {
      const position = deriveBoardPosition(parseSgf(`(;SZ[5]RU[${rules}]PL[B]AW[ab][ba][cb][bc])`), []);

      expect(isLegalMove(position, 'B', 'bb', rules)).toBe(false);
    }
  );

  it.each(['New Zealand', 'Tromp-Taylor'])('allows suicide under %s and credits the opponent capture', (rules) => {
    let document = createNewGame(5);
    document.root.data.RU = [rules];
    let result = addMove(document, [], 'W', 'ab');
    result = addMove(result.document, result.path, 'W', 'ba');
    result = addMove(result.document, result.path, 'W', 'cb');
    result = addMove(result.document, result.path, 'W', 'bc');

    expect(isLocallyLegalMove(deriveBoardPosition(result.document, result.path), 'B', 'bb', rules)).toBe(true);

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

  it('adds setup stones as setup nodes after regular moves', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const result = addSetupStone(first.document, first.path, 'W', 'pp');

    expect(result.path).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toContain(';B[dd];AW[pp])');
  });

  it('adds a setup stone where an earlier same-color move was captured', () => {
    const document = parseSgf('(;SZ[5];B[bb];W[ab];W[ba];W[cb];W[bc])');
    const result = addSetupStone(document, [0, 0, 0, 0, 0], 'B', 'bb');

    expect(result.placed).toBe(true);
    expect(serializeSgf(result.document)).toContain(';W[bc];AB[bb])');
  });

  it('keeps adding setup stones to the current setup leaf', () => {
    const first = addSetupStone(createNewGame(), [], 'B', 'dd');
    const second = addSetupStone(first.document, first.path, 'W', 'pp');

    expect(first.path).toEqual([]);
    expect(second.path).toEqual([]);
    expect(serializeSgf(second.document)).toContain('AB[dd]AW[pp]');
  });

  it('reuses an empty setup leaf after toggling its last setup stone off', () => {
    const first = addSetupStone(createNewGame(), [], 'B', 'dd');
    const empty = addSetupStone(first.document, first.path, 'B', 'dd', 'B');
    const second = addSetupStone(empty.document, empty.path, 'W', 'pp');

    expect(second.path).toEqual([]);
    expect(serializeSgf(second.document)).toContain('AW[pp]');
  });

  it('uses add-empty when placing the same color on an earlier stone', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const result = addSetupStone(first.document, first.path, 'B', 'dd', 'B');

    expect(serializeSgf(result.document)).toContain(';B[dd];AE[dd])');
  });

  it('keeps an earlier opposite-color move empty when toggling off a setup override', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];AW[dd])');
    const result = addSetupStone(document, [0, 0], 'W', 'dd', 'W');

    expect(serializeSgf(result.document)).toContain(';B[dd];AE[dd])');
  });

  it('restores an earlier same-color move when toggling off a setup override', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];AB[dd])');
    const result = addSetupStone(document, [0, 0], 'B', 'dd', 'B');

    expect(serializeSgf(result.document)).toContain(';B[dd];)');
  });

  it('removes add-empty instead of adding same-color setup over an earlier stone', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd];AE[dd])');
    const result = addSetupStone(document, [0, 0], 'B', 'dd');

    expect(serializeSgf(result.document)).toContain(';B[dd];)');
  });

  it('saves the player to play on setup nodes', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const setup = addSetupStone(first.document, first.path, 'W', 'pp', null, 'W');
    const toggled = updateSetupNextColor(setup.document, setup.path, 'B');

    expect(serializeSgf(setup.document)).toContain(';B[dd];PL[W]AW[pp])');
    expect(serializeSgf(toggled)).toContain(';B[dd];PL[B]AW[pp])');
    expect(deriveBoardPosition(setup.document, setup.path).nextColor).toBe('W');
    expect(deriveBoardPosition(toggled, setup.path).nextColor).toBe('B');
  });

  it('replays malformed records without applying turn, occupancy, or ko validation', () => {
    const document = parseSgf('(;SZ[5]AW[aa];B[aa];B[bb];W[ab];B[aa])');
    const position = deriveBoardPosition(document, [0, 0, 0, 0]);

    expect(position.stones.get('aa')).toBe('B');
    expect(position.stones.get('bb')).toBe('B');
    expect(position.nextColor).toBe('W');
  });

  it('does not count malformed coordinates as AGA pass stones', () => {
    const position = deriveBoardPosition(parseSgf('(;SZ[5]RU[AGA];B[x])'), [0]);
    expect(position.captures).toEqual({B: 0, W: 0});
  });
});
