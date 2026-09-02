import {describe, expect, it} from 'vitest';
import {
  addLabel,
  addMarkup,
  addMove,
  addScoringNode,
  addSetupNode,
  createNewGame,
  deleteNode,
  eraseAllMarkup,
  eraseMarkup,
  formatPoint,
  getBoardSize,
  getInitialCaptures,
  getInitialNextColor,
  moveBranch,
  moveBranchToMain,
  parseGib,
  parseSgf,
  pruneBranch,
  serializeSgf,
  updateComment,
  updateScoringPoints,
} from '.';

describe('sgf-core', () => {
  it('creates a 19x19 SGF by default', () => {
    const sgf = serializeSgf(createNewGame());
    expect(sgf).toContain('GM[1]FF[4]CA[UTF-8]SZ[19]');
    expect(sgf).toContain('KM[6.5]RU[Japanese]');
    expect(sgf).toMatch(/DT\[\d{4}-\d{2}-\d{2}\]/);
    expect(sgf).toMatch(/GN\[\d{4}-\d{4}-\d{4}\]/);
  });

  it('creates explicit board sizes', () => {
    expect(serializeSgf(createNewGame(13))).toContain('SZ[13]');
    expect(serializeSgf(createNewGame(9))).toContain('SZ[9]');
  });

  it('limits board sizes to the supported coordinate range', () => {
    expect(getBoardSize(parseSgf('(;SZ[1])'))).toBe(1);
    expect(getBoardSize(parseSgf('(;SZ[25])'))).toBe(25);
    for (const size of ['0', '-1', '1.5', '26', '100000', 'invalid']) {
      expect(getBoardSize(parseSgf(`(;SZ[${size}])`))).toBe(19);
    }
  });

  it('parses and serializes variations', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp]))');
    expect(document.root.children[0].children).toHaveLength(2);
    expect(serializeSgf(document)).toBe('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp]))');
  });

  it('reads initial capture counts from Ulugo SGF properties', () => {
    expect(getInitialCaptures(parseSgf('(;GM[1]SZ[19]XBC[3]XWC[1])'))).toEqual({B: 3, W: 1});
    expect(getInitialCaptures(parseSgf('(;GM[1]SZ[19]XBC[-1]XWC[invalid])'))).toEqual({B: 0, W: 0});
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

  it.each([
    ['375', '(;GM[1]SZ[19]KM[7.5]RU[Chinese])'],
    ['650', '(;GM[1]SZ[19]KM[6.5])'],
    ['750', '(;GM[1]SZ[19]KM[7.5])'],
  ])('normalizes encoded komi %s during parsing', (input, expected) => {
    const document = parseSgf(`(;GM[1]SZ[19]KM[${input}])`);
    expect(serializeSgf(document)).toBe(expected);
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

  it('formats old out-of-board pass moves as pass', () => {
    expect(formatPoint('tt', 19)).toBe('pass');
    expect(formatPoint('tt', 20)).toBe('U1');
  });

  it.each([
    ['a handicap', '(;GM[1]SZ[19]HA[2]AB[pd]AW[dp])', 'W'],
    ['a black-only root setup', '(;GM[1]SZ[19]AB[pd][dp])', 'W'],
    ['an explicit Black player', '(;GM[1]SZ[19]HA[2]AB[pd][dp]PL[B])', 'B'],
    ['a mixed root setup', '(;GM[1]SZ[19]AB[pd]AW[dp])', 'B'],
  ] as const)('infers the initial player for %s', (_name, sgf, nextColor) => {
    expect(getInitialNextColor(parseSgf(sgf))).toBe(nextColor);
  });

  it('adds and updates scoring nodes', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const scoring = addScoringNode(first.document, first.path, ['aa', 'aa'], ['bb']);
    const updated = updateScoringPoints(scoring.document, scoring.path, ['cc'], []);

    expect(scoring.path).toEqual([0, 0]);
    expect(serializeSgf(updated)).toContain(';B[dd];TB[cc]TW[])');
  });

  it('adds empty scoring nodes with explicit scoring properties', () => {
    const document = parseSgf(
      '(;CA[utf-8]AP[zhq][zhq_robot][zhq_robot_level]DT[2026-07-13]PB[烽烟弈客]PW[Steve Z]BR[6 段]WR[5 段]HA[0]RE[W+R]KM[7.5]SZ[19]RU[chinese]TM[1800]TC[3]TT[60]GN[[烽烟弈客\\]vs[Steve Z\\]_20260714064736];B[pd];W[dp];B[cd];W[qp];)'
    );
    const result = addScoringNode(document, [0, 0, 0, 0, 0], [], []);
    expect(result.path).toEqual([0, 0, 0, 0, 0, 0]);
    expect(serializeSgf(result.document)).toContain(';W[qp];;TB[]TW[])');
  });

  it('adds a setup node as the leftmost next branch', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd](;W[pp])(;W[qq]))');
    const result = addSetupNode(document, [0], ['aa'], ['bb'], ['dd'], 'W');

    expect(result.path).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toContain(';B[dd](;PL[W]AB[aa]AW[bb]AE[dd])(;W[pp])(;W[qq]))');
  });

  it('marks camera setup nodes with a custom Z property', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd])');
    const result = addSetupNode(document, [0], ['aa'], ['bb'], [], 'W', 'camera');

    expect(serializeSgf(result.document)).toContain(';PL[W]AB[aa]AW[bb]ZA[camera])');
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
