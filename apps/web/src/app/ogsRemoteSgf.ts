import type {RemoteSgfListItem, RemoteSgfSourceApi} from './remoteSgf';

const ogsOrigin = 'https://online-go.com';
const ogsPageSize = 20;

interface OgsPlayer {
  id: number;
  username: string;
  ranking?: number;
  professional?: boolean;
}

interface OgsGame {
  id: number;
  players: {black: OgsPlayer; white: OgsPlayer};
  historical_ratings?: {black?: OgsPlayer; white?: OgsPlayer} | null;
  width: number;
  height: number;
  outcome: string;
  black_lost: boolean;
  white_lost: boolean;
  annulled: boolean;
  started: string;
  ended: string;
}

interface OgsPage<T> {
  results: T[];
  next: string | null;
}

interface OgsCursor {
  url: string;
  playerId: number;
}

export const ogsRemoteSgfSource: RemoteSgfSourceApi = {
  isAvailable: async () => true,
  list: async ({query, cursor}) => {
    const trimmedQuery = query.trim();
    if (trimmedQuery === '') throw new Error('OGS username cannot be empty');

    const player = cursor == null ? await findPlayer(trimmedQuery) : null;
    const cursorData = cursor == null ? null : parseCursor(cursor);
    const playerId = player?.id ?? cursorData!.playerId;
    const url = cursorData?.url ?? gamesUrl(playerId);
    const page = await getJson<OgsPage<OgsGame>>(url);
    if (!Array.isArray(page.results)) throw new Error('OGS game list response has no results');

    return {
      query: player?.username ?? trimmedQuery,
      items: page.results.map((game) => mapGame(game, playerId)),
      nextCursor: page.next == null ? null : JSON.stringify({url: page.next, playerId} satisfies OgsCursor),
    };
  },
  read: async ({itemId}) => {
    if (!/^\d+$/.test(itemId)) throw new Error('Invalid OGS game ID');
    const response = await fetch(`${ogsOrigin}/api/v1/games/${itemId}/sgf/`);
    if (!response.ok) throw new Error(`OGS request failed with HTTP ${response.status}`);
    const content = await response.text();
    if (!content.trimStart().startsWith('(')) throw new Error('OGS game response has no valid SGF');
    return {content, fileName: `ogs-${itemId}.sgf`};
  },
};

async function findPlayer(username: string): Promise<OgsPlayer> {
  const url = new URL('/api/v1/players/', ogsOrigin);
  url.searchParams.set('username', username);
  const page = await getJson<OgsPage<OgsPlayer>>(url.toString());
  if (!Array.isArray(page.results)) throw new Error('OGS player response has no results');
  const normalizedUsername = username.toLocaleLowerCase();
  const player = page.results.find((candidate) => candidate.username.toLocaleLowerCase() === normalizedUsername);
  if (player == null || !Number.isInteger(player.id)) throw new Error(`OGS user not found: ${username}`);
  return player;
}

function gamesUrl(playerId: number): string {
  const url = new URL(`/api/v1/players/${playerId}/games/`, ogsOrigin);
  url.searchParams.set('ended__isnull', 'false');
  url.searchParams.set('ordering', '-ended');
  url.searchParams.set('page_size', String(ogsPageSize));
  return url.toString();
}

function parseCursor(cursor: string): OgsCursor {
  let value: unknown;
  try {
    value = JSON.parse(cursor);
  } catch {
    throw new Error('Invalid OGS game list cursor');
  }
  if (typeof value !== 'object' || value == null) throw new Error('Invalid OGS game list cursor');
  const {url, playerId} = value as Partial<OgsCursor>;
  if (typeof url !== 'string' || !Number.isInteger(playerId)) throw new Error('Invalid OGS game list cursor');
  const parsedUrl = new URL(url);
  const pathMatch = parsedUrl.pathname.match(/^\/api\/v1\/players\/(\d+)\/games\/?$/);
  if (parsedUrl.origin !== ogsOrigin || Number(pathMatch?.[1]) !== playerId) {
    throw new Error('Invalid OGS game list cursor');
  }
  return {url: parsedUrl.toString(), playerId};
}

function mapGame(game: OgsGame, playerId: number): RemoteSgfListItem {
  if (!Number.isInteger(game.id) || game.players?.black == null || game.players.white == null) {
    throw new Error('Invalid OGS game summary');
  }
  const black = game.players.black;
  const white = game.players.white;
  const queryPlayer = black.id === playerId ? 'black' : white.id === playerId ? 'white' : null;
  const winnerColor = game.annulled
    ? 'unknown'
    : game.black_lost && !game.white_lost
      ? 'white'
      : game.white_lost && !game.black_lost
        ? 'black'
        : !game.black_lost && !game.white_lost
          ? 'draw'
          : 'unknown';

  return {
    id: String(game.id),
    blackName: black.username,
    blackRank: formatRank(game.historical_ratings?.black ?? black),
    whiteName: white.username,
    whiteRank: formatRank(game.historical_ratings?.white ?? white),
    boardSize: game.width === game.height ? game.width : `${game.width}×${game.height}`,
    startTime: game.ended || game.started,
    result: formatResult(winnerColor, game.outcome),
    canOpen: true,
    queryPlayer,
    queryOutcome:
      winnerColor === 'draw'
        ? 'draw'
        : winnerColor === 'unknown' || queryPlayer == null
          ? 'unknown'
          : winnerColor === queryPlayer
            ? 'win'
            : 'loss',
  };
}

function formatRank(player: OgsPlayer): string {
  const ranking = player.ranking;
  if (typeof ranking !== 'number' || !Number.isFinite(ranking)) return '';
  if (player.professional) return `${Math.trunc(ranking > 900 ? ranking - 1036 : ranking - 36)}P`;
  return ranking < 30 ? `${Math.ceil(30 - ranking)}K` : `${Math.floor(ranking - 29)}D`;
}

function formatResult(winnerColor: 'black' | 'white' | 'draw' | 'unknown', outcome: string): string {
  if (winnerColor === 'draw') return 'Draw';
  if (winnerColor === 'unknown') return '?';
  const color = winnerColor === 'black' ? 'B' : 'W';
  if (/resign/i.test(outcome)) return `${color}+R`;
  if (/timeout/i.test(outcome)) return `${color}+T`;
  if (/disconnect|forfeit|abandon/i.test(outcome)) return `${color}+F`;
  const points = outcome.match(/\d+(?:\.\d+)?/i)?.[0];
  return `${color}+${points ?? outcome}`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {headers: {Accept: 'application/json'}});
  if (!response.ok) throw new Error(`OGS request failed with HTTP ${response.status}`);
  return (await response.json()) as T;
}
