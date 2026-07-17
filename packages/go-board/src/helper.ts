export const alpha = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
export type Vertex = [x: number, y: number];
export type VertexEventName = 'Click' | 'MouseMove' | 'MouseEnter' | 'MouseLeave' | 'PointerDown';

export const vertexEvents: VertexEventName[] = ['Click', 'MouseMove', 'MouseEnter', 'MouseLeave', 'PointerDown'];

export const range = (n: number) =>
  Array(n)
    .fill(0)
    .map((_, i: number) => i);

export const random = (n: number) => Math.floor(Math.random() * (n + 1));

export const vertexEquals = ([x1, y1]: Vertex, [x2, y2]: Vertex) => x1 === x2 && y1 === y2;

export function getHoshis(width: number, height: number): Vertex[] {
  if (Math.min(width, height) <= 6) return [];

  let [nearX, nearY] = [width, height].map((x) => (x >= 13 ? 3 : 2));
  let [farX, farY] = [width - nearX - 1, height - nearY - 1];
  let [middleX, middleY] = [width, height].map((x) => (x - 1) / 2);

  let result: Vertex[] = [
    [nearX, farY],
    [farX, nearY],
    [farX, farY],
    [nearX, nearY],
  ];

  if (width % 2 !== 0 && height % 2 !== 0 && width !== 7 && height !== 7) result.push([middleX, middleY]);
  if (width % 2 !== 0 && width !== 7) result.push([middleX, nearY], [middleX, farY]);
  if (height % 2 !== 0 && height !== 7) result.push([nearX, middleY], [farX, middleY]);

  return result;
}
