import {describe, expect, it} from 'vitest';
import {
  addLabel,
  addMarkup,
  addMove,
  addSetupStone,
  buildTree,
  countMoves,
  createNewGame,
  deleteNode,
  eraseAllMarkup,
  eraseMarkup,
  formatPoint,
  moveBranch,
  moveBranchToMain,
  parseGib,
  parseSgf,
  pruneBranch,
  replaceMove,
  serializeSgf,
  updateComment,
  updateSetupNextColor,
} from '.';

describe('sgf-core', () => {
  it('creates a 19x19 SGF by default', () => {
    const sgf = serializeSgf(createNewGame());
    expect(sgf).toContain('GM[1]FF[4]CA[UTF-8]SZ[19]');
    expect(sgf).toContain('KM[6.5]RU[Japanese]');
    expect(sgf).toMatch(/DT\[\d{4}-\d{2}-\d{2}\]/);
    expect(sgf).toMatch(/GN\[Game \d{12}\]/);
  });

  it('creates explicit board sizes', () => {
    expect(serializeSgf(createNewGame(13))).toContain('SZ[13]');
    expect(serializeSgf(createNewGame(9))).toContain('SZ[9]');
  });

  it('parses and serializes variations', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp]))');
    expect(document.root.children[0].children).toHaveLength(2);
    expect(serializeSgf(document)).toBe('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp]))');
  });

  it('parses Tygem GIB files into SGF documents', () => {
    const document = parseGib(
      [
        '\\\\[GAMEINFOMAIN=GTIME:600-30-3,GRLT:3,ZIPSU:0,GONGJE:65,LINE:19,\\\\]',
        '\\\\[GAMEINFOSUB=GNAME:rank game,GDATE:2024-06-04-01-02-03,GPLC:www.tygem.com,GCMT:comment\\\\]',
        '\\\\[WUSERINFO=WID:white_id,WLV:22,WNICK:white_nick,WNCD:0,WAID:1,WIMG:\\\\]',
        '\\\\[BUSERINFO=BID:\\uFFFD\\uFFFD,BLV:21,BNICK:black_nick,BNCD:0,BAID:2,BIMG:\\\\]',
        '\\\\[GAMETAG=C2024:06:04,W3,Z0,G65,\\\\]',
        'INI 0 0 2',
        'STO 0 0 1 4 4',
        'STO 0 0 2 15 15',
      ].join('\n')
    );

    expect(document.root.data).toMatchObject({
      GM: ['1'],
      FF: ['4'],
      CA: ['UTF-8'],
      SZ: ['19'],
      PB: ['black_nick'],
      BR: ['21'],
      PW: ['white_nick'],
      WR: ['22'],
      GN: ['rank game'],
      PC: ['www.tygem.com'],
      GC: ['comment'],
      KM: ['6.5'],
      RE: ['B+R'],
      DT: ['2024-06-04'],
      TM: ['600'],
      OT: ['3x30 byo-yomi'],
      HA: ['2'],
      AB: ['dp', 'pd'],
    });
    expect(serializeSgf(document)).toContain(';B[ee];W[pp]');
  });

  it('normalizes Chinese stone komi during parsing', () => {
    const document = parseSgf('(;GM[1]SZ[19]KM[375])');
    expect(serializeSgf(document)).toBe('(;GM[1]SZ[19]KM[7.5]RU[Chinese])');
  });

  it('preserves explicit rules when normalizing Chinese stone komi', () => {
    const document = parseSgf('(;GM[1]SZ[19]KM[375]RU[AGA])');
    expect(serializeSgf(document)).toBe('(;GM[1]SZ[19]KM[7.5]RU[AGA])');
  });

  it('escapes comments', () => {
    const document = updateComment(createNewGame(), [], 'one ] two \\ three');
    expect(serializeSgf(document)).toContain('C[one \\] two \\\\ three]');
  });

  it('adds moves, labels, and markup', () => {
    let result = addMove(createNewGame(), [], 'B', 'dd');
    let document = addMarkup(result.document, result.path, 'TR', 'pq');
    document = addLabel(document, result.path, 'dp', '1');

    expect(serializeSgf(document)).toContain(';B[dd]TR[pq]LB[dp:1])');
  });

  it('erases markup without removing stones', () => {
    let result = addMove(createNewGame(), [], 'B', 'dd');
    let document = addMarkup(result.document, result.path, 'TR', 'dd');
    document = addLabel(document, result.path, 'dp', '1');

    document = eraseMarkup(document, result.path, 'dd');
    document = eraseMarkup(document, result.path, 'dp');

    expect(serializeSgf(document)).toContain(';B[dd])');
  });

  it('erases all markup on a node without removing stones', () => {
    const result = addMove(createNewGame(), [], 'B', 'dd');
    let document = addMarkup(result.document, result.path, 'TR', 'dd');
    document = addMarkup(document, result.path, 'CR', 'pq');
    document = addLabel(document, result.path, 'dp', '1');

    document = eraseAllMarkup(document, result.path);

    expect(serializeSgf(document)).toContain(';B[dd])');
  });

  it('formats display coordinates without I', () => {
    expect(formatPoint('aa')).toBe('A19');
    expect(formatPoint('hh')).toBe('H12');
    expect(formatPoint('ii')).toBe('J11');
    expect(formatPoint('ss')).toBe('T1');
    expect(formatPoint('ii', 13)).toBe('J5');
  });

  it('counts moves across variations', () => {
    expect(countMoves(parseSgf('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp];B[pq]))'))).toBe(4);
  });

  it('gives setup nodes their own tree step after moves', () => {
    const tree = buildTree(parseSgf('(;GM[1]SZ[19];B[dd];AB[pq];W[pp])'))[0];
    expect(tree.children[0].moveNumber).toBe(1);
    expect(tree.children[0].children[0]).toMatchObject({
      moveNumber: 2,
      isSetup: true,
      setupColor: 'B',
    });
    expect(tree.children[0].children[0].children[0].moveNumber).toBe(3);
  });

  it('adds setup stones as setup nodes after regular moves', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const result = addSetupStone(first.document, first.path, 'W', 'pp');

    expect(result.path).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toContain(';B[dd];AW[pp])');
  });

  it('keeps adding setup stones to the current setup leaf', () => {
    const first = addSetupStone(createNewGame(), [], 'B', 'dd');
    const second = addSetupStone(first.document, first.path, 'W', 'pp');

    expect(second.path).toEqual(first.path);
    expect(serializeSgf(second.document)).toContain(';AB[dd]AW[pp])');
  });

  it('reuses an empty setup leaf after toggling its last setup stone off', () => {
    const first = addSetupStone(createNewGame(), [], 'B', 'dd');
    const empty = addSetupStone(first.document, first.path, 'B', 'dd', 'B');
    const second = addSetupStone(empty.document, empty.path, 'W', 'pp');

    expect(second.path).toEqual(first.path);
    expect(serializeSgf(second.document)).toContain(';AW[pp])');
  });

  it('uses add-empty when placing the same color on an earlier stone', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const result = addSetupStone(first.document, first.path, 'B', 'dd', 'B');

    expect(serializeSgf(result.document)).toContain(';B[dd];AE[dd])');
  });

  it('saves the player to play on setup nodes', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const setup = addSetupStone(first.document, first.path, 'W', 'pp', null, 'W');
    const toggled = updateSetupNextColor(setup.document, setup.path, 'B');

    expect(serializeSgf(setup.document)).toContain(';B[dd];PL[W]AW[pp])');
    expect(serializeSgf(toggled)).toContain(';B[dd];PL[B]AW[pp])');
  });

  it('reorders branches', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[aa](;W[bb])(;W[cc]))');
    const movedLeft = moveBranch(document, [0, 1], -1);
    expect(movedLeft.path).toEqual([0, 0]);
    expect(serializeSgf(movedLeft.document)).toBe('(;GM[1]SZ[19];B[aa](;W[cc])(;W[bb]))');

    const main = moveBranchToMain(document, [0, 1]);
    expect(main.path).toEqual([0, 0]);
    expect(serializeSgf(main.document)).toBe('(;GM[1]SZ[19];B[aa](;W[cc])(;W[bb]))');
  });

  it('replaces a move and merges matching branches', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[aa](;W[bb];B[dd])(;W[cc];B[ee]))');
    const result = replaceMove(document, [0, 1], 'bb');
    expect(result.path).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toBe('(;GM[1]SZ[19];B[aa];W[bb](;B[dd])(;B[ee]))');
  });

  it('deletes a node and its children', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[aa](;W[bb];B[dd])(;W[cc]))');
    const result = deleteNode(document, [0, 0]);
    expect(result.path).toEqual([0]);
    expect(serializeSgf(result.document)).toBe('(;GM[1]SZ[19];B[aa];W[cc])');
  });

  it('prunes branches from parent nodes while keeping child branches', () => {
    const document = parseSgf('(;GM[1]SZ[19](;B[aa](;W[bb])(;W[cc](;B[dd])(;B[ee])))(;B[ff]))');
    const result = pruneBranch(document, [0, 1]);
    expect(result.path).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toBe('(;GM[1]SZ[19];B[aa];W[cc](;B[dd])(;B[ee]))');
  });
});
