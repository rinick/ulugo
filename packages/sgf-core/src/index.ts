export type SgfColor = 'B' | 'W';
export type SgfPoint = string;
export type MarkupKind = 'CR' | 'SQ' | 'TR' | 'MA' | 'SL';

export interface SgfNode {
  id: string;
  data: Record<string, string[]>;
  children: SgfNode[];
}

export interface SgfDocument {
  root: SgfNode;
}

export interface TreeItem {
  id: string;
  path: number[];
  label: string;
  moveNumber: number;
  color: SgfColor | null;
  setupColor: SgfColor | null;
  point: SgfPoint | null;
  isSetup: boolean;
  hasMetadata: boolean;
  hasComment: boolean;
  hasDrawing: boolean;
  hasInitialBlackStones: boolean;
  children: TreeItem[];
}

const letters = 'abcdefghijklmnopqrstuvwxyz';
const coordinateLetters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

let nodeCounter = 0;

export function createNode(data: Record<string, string[]> = {}, children: SgfNode[] = []): SgfNode {
  nodeCounter += 1;
  return {id: `n${nodeCounter}`, data, children};
}

export function createNewGame(size = 19): SgfDocument {
  const now = new Date();
  const date = formatSgfDate(now);
  const name = `Game ${formatGameNameTimestamp(now)}`;

  return {
    root: createNode({
      GM: ['1'],
      FF: ['4'],
      CA: ['UTF-8'],
      SZ: [String(size)],
      DT: [date],
      KM: ['6.5'],
      RU: ['Japanese'],
      GN: [name],
    }),
  };
}

export function cloneDocument(document: SgfDocument): SgfDocument {
  return {root: cloneNode(document.root)};
}

export function cloneNode(node: SgfNode): SgfNode {
  return {
    id: node.id,
    data: Object.fromEntries(Object.entries(node.data).map(([key, values]) => [key, [...values]])),
    children: node.children.map(cloneNode),
  };
}

export function parseSgf(input: string): SgfDocument {
  const parser = new Parser(input);
  const root = parser.parseCollection();
  normalizeRootProperties(root);
  return {root};
}

export function parseGib(input: string): SgfDocument {
  const root = createNode({
    GM: ['1'],
    FF: ['4'],
    CA: ['UTF-8'],
    SZ: ['19'],
  });
  let lastNode = root;
  let hasGibContent = false;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const blackName = readGibTag(line, 'GAMEBLACKNAME');
    if (blackName != null) {
      const [name, rank] = parseGibPlayerName(blackName);
      if (name !== '') root.data.PB = [name];
      if (rank !== '') root.data.BR = [rank];
      hasGibContent = true;
      continue;
    }

    const whiteName = readGibTag(line, 'GAMEWHITENAME');
    if (whiteName != null) {
      const [name, rank] = parseGibPlayerName(whiteName);
      if (name !== '') root.data.PW = [name];
      if (rank !== '') root.data.WR = [rank];
      hasGibContent = true;
      continue;
    }

    const gameInfoMain = readGibTag(line, 'GAMEINFOMAIN');
    if (gameInfoMain != null) {
      const fields = parseGibFields(gameInfoMain);
      setGibPropertyIfMissing(root, 'RE', readGibResult(gameInfoMain, /GRLT:(\d+),/, /ZIPSU:(\d+),/));
      setGibPropertyIfMissing(root, 'KM', readGibKomi(gameInfoMain, /GONGJE:(\d+),/));
      setGibProperty(root, 'SZ', readGibNumber(fields.LINE));
      setGibTimeProperties(root, fields.GTIME);
      hasGibContent = true;
      continue;
    }

    const gameInfoSub = readGibTag(line, 'GAMEINFOSUB');
    if (gameInfoSub != null) {
      const fields = parseGibFields(gameInfoSub);
      setGibStringPropertyIfMissing(root, 'GN', fields.GNAME);
      setGibStringPropertyIfMissing(root, 'DT', formatGibDateValue(fields.GDATE));
      setGibStringPropertyIfMissing(root, 'PC', fields.GPLC);
      setGibStringPropertyIfMissing(root, 'GC', fields.GCMT);
      hasGibContent = true;
      continue;
    }

    const whiteInfo = readGibTag(line, 'WUSERINFO');
    if (whiteInfo != null) {
      setGibPlayerProperties(root, 'W', parseGibFields(whiteInfo));
      hasGibContent = true;
      continue;
    }

    const blackInfo = readGibTag(line, 'BUSERINFO');
    if (blackInfo != null) {
      setGibPlayerProperties(root, 'B', parseGibFields(blackInfo));
      hasGibContent = true;
      continue;
    }

    const gameTag = readGibTag(line, 'GAMETAG');
    if (gameTag != null) {
      const fields = parseGibFields(gameTag);
      setGibPropertyIfMissing(root, 'DT', readGibDate(gameTag));
      setGibPropertyIfMissing(root, 'RE', readGibResult(gameTag, /,W(\d+),/, /,Z(\d+),/));
      setGibPropertyIfMissing(root, 'KM', readGibKomi(gameTag, /,G(\d+),/));
      setGibStringPropertyIfMissing(root, 'PW', fields.A ?? fields.I);
      setGibStringPropertyIfMissing(root, 'PB', fields.B ?? fields.M);
      setGibStringPropertyIfMissing(root, 'WR', fields.L);
      setGibStringPropertyIfMissing(root, 'BR', fields.N);
      setGibTimeProperties(root, fields.T == null ? null : reverseGibTime(fields.T));
      hasGibContent = true;
      continue;
    }

    if (line.startsWith('INI')) {
      const parts = line.split(/\s+/);
      const handicap = Math.floor(Number(parts[3]));
      if (handicap >= 2 && handicap <= 9) {
        root.data.HA = [String(handicap)];
        root.data.AB = tygemHandicapPoints(handicap).map(([x, y]) => vertexToPoint(x, y));
      }
      hasGibContent = true;
      continue;
    }

    if (line.startsWith('STO')) {
      const parts = line.split(/\s+/);
      const color = parts[3] === '1' ? 'B' : parts[3] === '2' ? 'W' : null;
      const x = Math.floor(Number(parts[4]));
      const y = Math.floor(Number(parts[5]));
      if (color == null || !isBoardVertex(x, y, 19)) continue;

      const child = createNode({[color]: [vertexToPoint(x, y)]});
      lastNode.children.push(child);
      lastNode = child;
      hasGibContent = true;
      continue;
    }

    if (line.startsWith('SUR')) {
      const parts = line.split(/\s+/);
      if (root.data.RE == null) {
        const resigningColor = parts[3] === '1' ? 'B' : parts[3] === '2' ? 'W' : null;
        if (resigningColor != null) root.data.RE = [`${resigningColor === 'B' ? 'W' : 'B'}+R`];
      }
      hasGibContent = true;
    }
  }

  if (!hasGibContent) throw new Error('GIB file does not contain a supported game record.');
  removeEmptyProperties(root);
  return {root};
}

function normalizeRootProperties(root: SgfNode): void {
  if (Number(root.data.KM?.[0]?.trim().replace(',', '.')) !== 375) return;

  root.data.KM = ['7.5'];
  if (root.data.RU?.[0]?.trim() == null || root.data.RU[0].trim() === '') root.data.RU = ['Chinese'];
}

function readGibTag(line: string, key: string): string | null {
  const match = new RegExp(`^\\\\+\\[${key}=([\\s\\S]*?)\\\\+\\]$`).exec(line);
  return match?.[1] ?? null;
}

function parseGibPlayerName(raw: string): [string, string] {
  const match = /^(.*)\(([^()]*)\)$/.exec(raw);
  if (match == null) return [cleanGibText(raw), ''];
  return [cleanGibText(match[1]), cleanGibText(match[2])];
}

function setGibPropertyIfMissing(node: SgfNode, key: string, values: string[] | undefined): void {
  if (node.data[key] == null && values != null) node.data[key] = values;
}

function setGibProperty(node: SgfNode, key: string, values: string[] | undefined): void {
  if (values != null) node.data[key] = values;
}

function setGibStringPropertyIfMissing(node: SgfNode, key: string, value: string | null | undefined): void {
  const cleaned = cleanGibText(value ?? '');
  if (node.data[key] == null && cleaned !== '') node.data[key] = [cleaned];
}

function setGibPlayerProperties(root: SgfNode, color: SgfColor, fields: Record<string, string>): void {
  const prefix = color;
  setGibStringPropertyIfMissing(root, `P${color}`, firstCleanGibText(fields[`${prefix}NICK`], fields[`${prefix}ID`]));
  setGibStringPropertyIfMissing(root, `${color}R`, fields[`${prefix}LV`]);
}

function setGibTimeProperties(root: SgfNode, value: string | null | undefined): void {
  const time = parseGibTime(value);
  if (time == null) return;
  setGibPropertyIfMissing(root, 'TM', [String(time.mainTime)]);
  if (time.periodTime != null && time.periods != null) {
    setGibPropertyIfMissing(root, 'OT', [`${time.periods}x${time.periodTime} byo-yomi`]);
  }
}

function readGibResult(line: string, resultRegex: RegExp, scoreRegex: RegExp): string[] | undefined {
  const resultMatch = resultRegex.exec(line);
  const scoreMatch = scoreRegex.exec(line);
  if (resultMatch == null || scoreMatch == null) return undefined;

  const result = formatGibResult(Number(resultMatch[1]), Number(scoreMatch[1]));
  return result === '' ? undefined : [result];
}

function formatGibResult(resultType: number, score: number): string {
  if (resultType === 3) return 'B+R';
  if (resultType === 4) return 'W+R';
  if (resultType === 7) return 'B+T';
  if (resultType === 8) return 'W+T';
  if (resultType === 0 || resultType === 1) return `${resultType === 0 ? 'B' : 'W'}+${score / 10}`;
  return '';
}

function readGibKomi(line: string, regex: RegExp): string[] | undefined {
  const match = regex.exec(line);
  if (match == null) return undefined;

  const komi = Number(match[1]) / 10;
  return Number.isFinite(komi) ? [String(komi)] : undefined;
}

function readGibDate(line: string): string[] | undefined {
  const match = /C(\d\d\d\d):(\d\d):(\d\d)/.exec(line);
  return match == null ? undefined : [match.slice(1, 4).join('-')];
}

function parseGibFields(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of value.split(',')) {
    const separator = part.indexOf(':');
    if (separator <= 0) continue;
    result[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return result;
}

function readGibNumber(value: string | null | undefined): string[] | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? [String(number)] : undefined;
}

function formatGibDateValue(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d\d)-(\d\d)/.exec(value ?? '');
  return match == null ? cleanGibText(value ?? '') : match.slice(1, 4).join('-');
}

function parseGibTime(value: string | null | undefined): {
  mainTime: number;
  periodTime: number | null;
  periods: number | null;
} | null {
  const parts = (value ?? '').split('-').map((part) => Number(part));
  if (!Number.isFinite(parts[0]) || parts[0] <= 0) return null;

  return {
    mainTime: parts[0],
    periodTime: Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : null,
    periods: Number.isFinite(parts[2]) && parts[2] > 0 ? parts[2] : null,
  };
}

function reverseGibTime(value: string): string {
  const parts = value.split('-');
  return parts.length === 3 ? [parts[2], parts[0], parts[1]].join('-') : value;
}

function cleanGibText(value: string): string {
  const trimmed = value.trim();
  return /^[\x20-\x7E]*$/.test(trimmed) ? trimmed : '';
}

function firstCleanGibText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const cleaned = cleanGibText(value ?? '');
    if (cleaned !== '') return cleaned;
  }
  return '';
}

function removeEmptyProperties(node: SgfNode): void {
  for (const [key, values] of Object.entries(node.data)) {
    if (values == null || values.length === 0) delete node.data[key];
  }
}

function isBoardVertex(x: number, y: number, size: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < size && y >= 0 && y < size;
}

function tygemHandicapPoints(count: number): Array<[number, number]> {
  const near = 3;
  const far = 15;
  const middle = 9;
  const points: Array<[number, number]> = [
    [near, far],
    [far, near],
    [near, near],
    [far, far],
  ];

  if (count === 5) points.push([middle, middle]);
  points.push([near, middle], [far, middle]);
  if (count === 7) points.push([middle, middle]);
  points.push([middle, near], [middle, far], [middle, middle]);

  return points.slice(0, count);
}

export function serializeSgf(document: SgfDocument): string {
  return serializeTree(document.root);
}

export function getBoardSize(document: SgfDocument): number {
  const size = Number(document.root.data.SZ?.[0] ?? 19);
  return Number.isFinite(size) && size > 0 ? size : 19;
}

export function pointToVertex(point: SgfPoint): [number, number] | null {
  if (point.length !== 2) return null;
  const x = letters.indexOf(point[0]);
  const y = letters.indexOf(point[1]);
  if (x < 0 || y < 0) return null;
  return [x, y];
}

export function vertexToPoint(x: number, y: number): SgfPoint {
  return `${letters[x] ?? ''}${letters[y] ?? ''}`;
}

export function getNodeAtPath(document: SgfDocument, path: number[]): SgfNode {
  let node = document.root;
  for (const index of path) {
    const child = node.children[index];
    if (child == null) throw new Error(`Invalid SGF path: ${path.join('.')}`);
    node = child;
  }
  return node;
}

export function getLine(document: SgfDocument, path: number[]): SgfNode[] {
  const nodes = [document.root];
  let node = document.root;
  for (const index of path) {
    const child = node.children[index];
    if (child == null) break;
    nodes.push(child);
    node = child;
  }
  return nodes;
}

export function updateComment(document: SgfDocument, path: number[], comment: string): SgfDocument {
  return updateNode(document, path, (node) => setProperty(node, 'C', comment === '' ? [] : [comment]));
}

export function updateGameInfo(document: SgfDocument, values: Record<string, string>): SgfDocument {
  const next = cloneDocument(document);
  for (const [key, value] of Object.entries(values)) {
    setProperty(next.root, key, value.trim() === '' ? [] : [value]);
  }
  return next;
}

export function addMove(
  document: SgfDocument,
  path: number[],
  color: SgfColor,
  point: SgfPoint
): {document: SgfDocument; path: number[]} {
  const next = cloneDocument(document);
  const parent = getNodeAtPath(next, path);
  const child = createNode({[color]: [point]});
  parent.children.push(child);
  return {document: next, path: [...path, parent.children.length - 1]};
}

export function countMoves(document: SgfDocument): number {
  let count = 0;

  function walk(node: SgfNode): void {
    if (node.data.B != null || node.data.W != null) count += 1;
    for (const child of node.children) walk(child);
  }

  walk(document.root);
  return count;
}

export function moveBranchToMain(document: SgfDocument, path: number[]): {document: SgfDocument; path: number[]} {
  if (path.length === 0) return {document, path};

  const next = cloneDocument(document);
  let node = next.root;
  for (const childIndex of path) {
    const child = node.children[childIndex];
    if (child == null) throw new Error(`Invalid SGF path: ${path.join('.')}`);
    node.children.splice(childIndex, 1);
    node.children.unshift(child);
    node = child;
  }

  return {document: next, path: path.map(() => 0)};
}

export function moveBranch(
  document: SgfDocument,
  path: number[],
  direction: -1 | 1
): {document: SgfDocument; path: number[]} {
  if (path.length === 0) return {document, path};

  const next = cloneDocument(document);
  const nextPath = [...path];

  for (let depth = path.length - 1; depth >= 0; depth -= 1) {
    const parentPath = path.slice(0, depth);
    const parent = getNodeAtPath(next, parentPath);
    const index = path[depth];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= parent.children.length) continue;

    [parent.children[index], parent.children[targetIndex]] = [parent.children[targetIndex], parent.children[index]];
    nextPath[depth] = targetIndex;
    return {document: next, path: nextPath};
  }

  return {document, path};
}

export function deleteNode(document: SgfDocument, path: number[]): {document: SgfDocument; path: number[]} {
  if (path.length === 0) return {document, path};

  const next = cloneDocument(document);
  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(next, parentPath);
  parent.children.splice(path[path.length - 1], 1);
  return {document: next, path: parentPath};
}

export function pruneBranch(document: SgfDocument, path: number[]): {document: SgfDocument; path: number[]} {
  if (path.length === 0) return {document, path};

  const next = cloneDocument(document);
  let node = next.root;
  for (const childIndex of path) {
    const child = node.children[childIndex];
    if (child == null) throw new Error(`Invalid SGF path: ${path.join('.')}`);
    node.children = [child];
    node = child;
  }

  return {document: next, path: path.map(() => 0)};
}

export function replaceMove(
  document: SgfDocument,
  path: number[],
  point: SgfPoint
): {document: SgfDocument; path: number[]} {
  if (path.length === 0) return {document, path};

  const current = getNodeAtPath(document, path);
  const color: SgfColor | null = current.data.B != null ? 'B' : current.data.W != null ? 'W' : null;
  if (color == null) return {document, path};

  const next = cloneDocument(document);
  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(next, parentPath);
  const index = path[path.length - 1];
  const node = parent.children[index];
  const existingIndex = parent.children.findIndex((child, childIndex) => {
    if (childIndex === index) return false;
    return child.data[color]?.[0] === point;
  });

  if (existingIndex >= 0) {
    const existing = parent.children[existingIndex];
    existing.children.push(...node.children);
    parent.children.splice(index, 1);
    const adjustedIndex = existingIndex > index ? existingIndex - 1 : existingIndex;
    return {document: next, path: [...parentPath, adjustedIndex]};
  }

  setProperty(node, color, [point]);
  return {document: next, path};
}

export function addSetupStone(document: SgfDocument, path: number[], color: SgfColor, point: SgfPoint): SgfDocument {
  const prop = color === 'B' ? 'AB' : 'AW';
  const opposite = color === 'B' ? 'AW' : 'AB';

  return updateNode(document, path, (node) => {
    removePointFromProperties(node, [opposite, 'AE'], point);
    addPointValue(node, prop, point);
  });
}

export function erasePoint(document: SgfDocument, path: number[], point: SgfPoint): SgfDocument {
  return updateNode(document, path, (node) => {
    removePointFromProperties(node, ['AB', 'AW', 'B', 'W', 'CR', 'SQ', 'TR', 'MA', 'SL'], point);
    removeLabel(node, point);
    addPointValue(node, 'AE', point);
  });
}

export function eraseMarkup(document: SgfDocument, path: number[], point: SgfPoint): SgfDocument {
  return updateNode(document, path, (node) => {
    removePointFromProperties(node, ['CR', 'SQ', 'TR', 'MA', 'SL'], point);
    removeLabel(node, point);
  });
}

export function addMarkup(document: SgfDocument, path: number[], kind: MarkupKind, point: SgfPoint): SgfDocument {
  return updateNode(document, path, (node) => {
    removePointFromProperties(node, ['CR', 'SQ', 'TR', 'MA', 'SL'], point);
    addPointValue(node, kind, point);
  });
}

export function addLabel(document: SgfDocument, path: number[], point: SgfPoint, label: string): SgfDocument {
  return updateNode(document, path, (node) => {
    removeLabel(node, point);
    addPointValue(node, 'LB', `${point}:${label}`);
  });
}

export function getComment(document: SgfDocument, path: number[]): string {
  return getNodeAtPath(document, path).data.C?.[0] ?? '';
}

export function getGameInfo(document: SgfDocument): Record<string, string> {
  const keys = ['PB', 'PW', 'BR', 'WR', 'EV', 'RO', 'DT', 'PC', 'KM', 'HA', 'RU', 'RE', 'GN', 'GC'];
  return Object.fromEntries(keys.map((key) => [key, document.root.data[key]?.[0] ?? '']));
}

export function buildTree(document: SgfDocument): TreeItem[] {
  const items: TreeItem[] = [];
  const boardSize = getBoardSize(document);

  function walk(node: SgfNode, path: number[], moveNumber: number): TreeItem {
    const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    const point = color == null ? null : (node.data[color]?.[0] ?? '');
    const isRoot = path.length === 0;
    const isSetup = color == null && hasSetupProperties(node);
    const setupColor = setupNodeColor(node);
    const nextMoveNumber = color != null || (isSetup && !isRoot) ? moveNumber + 1 : moveNumber;
    const displayMoveNumber = isRoot ? 0 : nextMoveNumber;
    const label =
      color == null
        ? isSetup
          ? `${displayMoveNumber} +`
          : '0 Root'
        : `${color}${nextMoveNumber} ${formatPoint(point, boardSize)}`;

    return {
      id: node.id,
      path,
      label,
      moveNumber: displayMoveNumber,
      color,
      setupColor,
      point: color == null ? null : point,
      isSetup,
      hasMetadata: hasNodeMetadata(node),
      hasComment: hasNodeComment(node),
      hasDrawing: hasNodeDrawing(node),
      hasInitialBlackStones: color == null && (node.data.AB ?? []).length > 0,
      children: node.children.map((child, index) => walk(child, [...path, index], nextMoveNumber)),
    };
  }

  items.push(walk(document.root, [], 0));
  return items;
}

function hasSetupProperties(node: SgfNode): boolean {
  return ['AB', 'AW', 'AE'].some((key) => (node.data[key] ?? []).length > 0);
}

function setupNodeColor(node: SgfNode): SgfColor | null {
  const hasBlack = (node.data.AB ?? []).length > 0;
  const hasWhite = (node.data.AW ?? []).length > 0;
  if (hasBlack === hasWhite) return null;
  return hasBlack ? 'B' : 'W';
}

function hasNodeMetadata(node: SgfNode): boolean {
  const moveKeys = new Set(['B', 'W']);
  return Object.keys(node.data).some((key) => !moveKeys.has(key));
}

function hasNodeComment(node: SgfNode): boolean {
  return (node.data.C ?? []).some((value) => value.length > 0);
}

function hasNodeDrawing(node: SgfNode): boolean {
  const drawingKeys = ['CR', 'SQ', 'TR', 'MA', 'SL', 'LB', 'AR', 'LN', 'DD'];
  return drawingKeys.some((key) => (node.data[key] ?? []).length > 0);
}

function formatSgfDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatGameNameTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
}

export function samePath(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function formatPoint(point: string | null, boardSize = 19): string {
  if (point == null) return '';
  if (point === '') return 'pass';
  const vertex = pointToVertex(point);
  if (vertex == null) return point;
  return `${coordinateLetters[vertex[0]] ?? letters[vertex[0]].toUpperCase()}${boardSize - vertex[1]}`;
}

function updateNode(document: SgfDocument, path: number[], update: (node: SgfNode) => void): SgfDocument {
  const next = cloneDocument(document);
  update(getNodeAtPath(next, path));
  return next;
}

function setProperty(node: SgfNode, key: string, values: string[]): void {
  if (values.length === 0) {
    delete node.data[key];
  } else {
    node.data[key] = values;
  }
}

function addPointValue(node: SgfNode, key: string, value: string): void {
  const values = node.data[key] ?? [];
  if (!values.includes(value)) node.data[key] = [...values, value];
}

function removePointFromProperties(node: SgfNode, keys: string[], point: SgfPoint): void {
  for (const key of keys) {
    const values = node.data[key];
    if (values == null) continue;

    const next = values.filter((value) => value.slice(0, 2) !== point);
    if (next.length === 0) {
      delete node.data[key];
    } else {
      node.data[key] = next;
    }
  }
}

function removeLabel(node: SgfNode, point: SgfPoint): void {
  const values = node.data.LB;
  if (values == null) return;

  const next = values.filter((value) => !value.startsWith(`${point}:`));
  if (next.length === 0) {
    delete node.data.LB;
  } else {
    node.data.LB = next;
  }
}

function serializeTree(root: SgfNode): string {
  const sequence: SgfNode[] = [];
  let current: SgfNode | null = root;

  while (current != null) {
    sequence.push(current);
    current = current.children.length === 1 ? current.children[0] : null;
  }

  let output = `(${sequence.map(serializeNode).join('')}`;
  const last = sequence[sequence.length - 1];
  for (const child of last.children) {
    output += serializeTree(child);
  }
  output += ')';
  return output;
}

function serializeNode(node: SgfNode): string {
  return `;${Object.entries(node.data)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => `${key}${values.map((value) => `[${escapeValue(value)}]`).join('')}`)
    .join('')}`;
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function unescapeValue(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\' && index + 1 < value.length) {
      index += 1;
      output += value[index];
    } else {
      output += char;
    }
  }
  return output;
}

class Parser {
  private index = 0;

  constructor(private readonly input: string) {}

  parseCollection(): SgfNode {
    this.skipSpace();
    const root = this.parseTree();
    this.skipSpace();
    return root;
  }

  private parseTree(): SgfNode {
    this.expect('(');
    const sequence: SgfNode[] = [];

    while (true) {
      this.skipSpace();
      if (this.peek() !== ';') break;
      sequence.push(this.parseNode());
    }

    if (sequence.length === 0) throw new Error('SGF game tree must contain at least one node.');

    for (let index = 0; index < sequence.length - 1; index += 1) {
      sequence[index].children.push(sequence[index + 1]);
    }

    const tail = sequence[sequence.length - 1];
    while (true) {
      this.skipSpace();
      if (this.peek() !== '(') break;
      tail.children.push(this.parseTree());
    }

    this.skipSpace();
    this.expect(')');
    return sequence[0];
  }

  private parseNode(): SgfNode {
    this.expect(';');
    const data: Record<string, string[]> = {};

    while (true) {
      this.skipSpace();
      const key = this.readIdentifier();
      if (key === '') break;

      const values: string[] = [];
      while (true) {
        this.skipSpace();
        if (this.peek() !== '[') break;
        values.push(this.readValue());
      }
      data[key] = [...(data[key] ?? []), ...values];
    }

    return createNode(data);
  }

  private readIdentifier(): string {
    let key = '';
    while (/[A-Za-z]/.test(this.peek())) {
      key += this.input[this.index];
      this.index += 1;
    }
    return key.toUpperCase();
  }

  private readValue(): string {
    this.expect('[');
    let raw = '';

    while (this.index < this.input.length) {
      const char = this.input[this.index];
      if (char === ']') {
        this.index += 1;
        return unescapeValue(raw);
      }

      raw += char;
      this.index += 1;
      if (char === '\\' && this.index < this.input.length) {
        raw += this.input[this.index];
        this.index += 1;
      }
    }

    throw new Error('Unterminated SGF property value.');
  }

  private skipSpace(): void {
    while (/\s/.test(this.peek())) this.index += 1;
  }

  private peek(): string {
    return this.input[this.index] ?? '';
  }

  private expect(char: string): void {
    if (this.peek() !== char) {
      throw new Error(`Expected "${char}" at offset ${this.index}.`);
    }
    this.index += 1;
  }
}
