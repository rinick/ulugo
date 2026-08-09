import {Board} from '@ulugo/go-board';
import {createNewGame, type SgfDocument} from '@ulugo/sgf-core';
import {Alert, Button, Modal, Segmented, Select, Spin} from 'antd';
import {useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {recognizedCaptureCounts} from '../../app/appEditorUtils';
import {isElectron, isMobileBrowser} from '../../app/capabilities';
import type {AppLanguage} from '../../app/localizationUtils';

type ScanBoard = number[][];
type Phase = 'select' | 'crop' | 'recognizing' | 'error' | 'screenshot' | 'result';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoardRecognitionModalProps {
  image: Blob;
  language: AppLanguage;
  setupBoardSize?: number;
  onClose: () => void;
  onConfirm: (document: SgfDocument) => void;
}

const fullCrop: CropRect = {x: 0, y: 0, width: 1, height: 1};
const maxScanImageDimension = 2048;
const ruleOptions = ['Japanese', 'Chinese', 'Korean', 'AGA', 'New Zealand'] as const;

export default function BoardRecognitionModal({
  image,
  language,
  setupBoardSize,
  onClose,
  onConfirm,
}: BoardRecognitionModalProps) {
  const {t} = useTranslation();
  const [phase, setPhase] = useState<Phase>('select');
  const [boardSize, setBoardSize] = useState(setupBoardSize ?? 19);
  const [crop, setCrop] = useState<CropRect>(fullCrop);
  const [recognizedImage, setRecognizedImage] = useState<Blob>(image);
  const [board, setBoard] = useState<ScanBoard | null>(null);
  const [rules, setRules] = useState<(typeof ruleOptions)[number]>('Chinese');
  const [handicap, setHandicap] = useState(0);
  const [nextPlayer, setNextPlayer] = useState<'B' | 'W'>('B');
  const sourceUrl = useBlobUrl(image);
  const recognizedUrl = useBlobUrl(recognizedImage);

  useEffect(() => {
    setPhase('select');
    setBoardSize(setupBoardSize ?? 19);
    setCrop(fullCrop);
    setRecognizedImage(image);
    setBoard(null);
  }, [image, setupBoardSize]);

  async function recognize(blob: Blob): Promise<void> {
    setPhase('recognizing');

    try {
      const scanImage = await resizeImageForScan(blob);
      setRecognizedImage(scanImage);
      const {recognizeBoard} = await import('uluscan');
      const result = await new Promise<{d: number[][]} | {s: true} | {e: true}>((resolve) => {
        recognizeBoard(scanImage, resolve, {lineCount: boardSize, sCheck: !isMobileBrowser});
      });

      if ('s' in result) {
        setPhase('screenshot');
      } else if ('e' in result) {
        setPhase('error');
      } else {
        setBoard(result.d);
        setNextPlayer(defaultNextPlayer(result.d));
        setPhase('result');
      }
    } catch {
      setPhase('error');
    }
  }

  async function applyCrop(): Promise<void> {
    try {
      await recognize(await cropImage(image, crop));
    } catch {
      setPhase('error');
    }
  }

  function confirm(): void {
    if (board == null) return;
    onConfirm(createRecognizedGame(board, rules, handicap, nextPlayer));
  }

  const screenshotDetailsUrl = `https://deepmess.com/${language}/ulugo/scan.html#screenshot`;

  return (
    <Modal
      centered
      open
      footer={null}
      maskClosable={false}
      keyboard={false}
      onCancel={onClose}
      width={960}
      className="board-recognition-modal"
      title={t('boardRecognition')}
    >
      {phase === 'select' ? (
        <div className="board-recognition-step board-recognition-select">
          <div className="board-recognition-image-frame">
            <img src={sourceUrl} alt={t('boardRecognitionImage')} />
          </div>
          {setupBoardSize == null ? (
            <label className="board-recognition-field">
              <span>{t('boardSize')}</span>
              <Segmented<number>
                value={boardSize}
                options={[9, 13, 19].map((value) => ({label: `${value} × ${value}`, value}))}
                onChange={setBoardSize}
              />
            </label>
          ) : null}
          <div className="board-recognition-actions">
            <Button onClick={() => setPhase('crop')}>{t('crop')}</Button>
            <Button onClick={onClose}>{t('close')}</Button>
            <Button type="primary" onClick={() => void recognize(image)}>
              {t('apply')}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'crop' ? (
        <div className="board-recognition-step board-recognition-crop">
          <Alert type="info" showIcon message={t('cropBoardPrompt')} />
          <CropEditor imageUrl={sourceUrl} crop={crop} onChange={setCrop} />
          <div className="board-recognition-actions">
            <Button onClick={() => setPhase('select')}>{t('back')}</Button>
            <Button type="primary" onClick={() => void applyCrop()}>
              {t('apply')}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'recognizing' ? (
        <div className="board-recognition-state">
          <Spin size="large" />
          <span>{t('recognizingBoard')}</span>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="board-recognition-step board-recognition-state">
          <Alert
            type="error"
            showIcon
            message={t('boardRecognitionFailed')}
            description={t('boardRecognitionFailedHelp')}
          />
          <div className="board-recognition-actions">
            <Button onClick={onClose}>{t('close')}</Button>
            <Button type="primary" onClick={() => setPhase('select')}>
              {t('back')}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'screenshot' ? (
        <div className="board-recognition-step board-recognition-state">
          <Alert
            type="warning"
            showIcon
            message={t('gameScreenshotDetected')}
            description={
              <>
                <div>{t('gameScreenshotExplanation')}</div>
                <a
                  href={screenshotDetailsUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (!isElectron || window.ulugo == null) return;
                    event.preventDefault();
                    void window.ulugo.openExternal(screenshotDetailsUrl);
                  }}
                >
                  {t('details')}
                </a>
              </>
            }
          />
          <div className="board-recognition-actions">
            <Button type="primary" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'result' && board != null ? (
        <div className="board-recognition-step board-recognition-result">
          <div className="board-recognition-result-content">
            <div className="board-recognition-result-side">
              <div className="board-recognition-image-frame board-recognition-result-image">
                <img src={recognizedUrl} alt={t('boardRecognitionImage')} />
              </div>
              <RecognitionOptions
                rules={rules}
                handicap={handicap}
                nextPlayer={nextPlayer}
                setupOnly={setupBoardSize != null}
                onRulesChange={setRules}
                onHandicapChange={setHandicap}
                onNextPlayerChange={setNextPlayer}
              />
            </div>
            <BoardPreview board={board} />
          </div>
          <div className="board-recognition-actions">
            <Button
              onClick={() => {
                setCrop(fullCrop);
                setPhase('crop');
              }}
            >
              {t('crop')}
            </Button>
            <Button onClick={onClose}>{t('close')}</Button>
            <Button type="primary" onClick={confirm}>
              {t('confirm')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function RecognitionOptions({
  rules,
  handicap,
  nextPlayer,
  setupOnly,
  onRulesChange,
  onHandicapChange,
  onNextPlayerChange,
}: {
  rules: (typeof ruleOptions)[number];
  handicap: number;
  nextPlayer: 'B' | 'W';
  setupOnly: boolean;
  onRulesChange: (value: (typeof ruleOptions)[number]) => void;
  onHandicapChange: (value: number) => void;
  onNextPlayerChange: (value: 'B' | 'W') => void;
}) {
  const {t} = useTranslation();

  return (
    <div className="board-recognition-options">
      {setupOnly ? null : (
        <>
          <label className="board-recognition-field">
            <span>{t('RU')}</span>
            <Select
              value={rules}
              options={ruleOptions.map((value) => ({value, label: t(ruleLabelKey(value))}))}
              onChange={onRulesChange}
            />
          </label>
          <label className="board-recognition-field">
            <span>{t('HA')}</span>
            <Select
              value={handicap}
              options={Array.from({length: 10}, (_, value) => ({
                value,
                label: value === 0 ? t('none') : String(value),
              }))}
              onChange={onHandicapChange}
            />
          </label>
        </>
      )}
      <label className="board-recognition-field">
        <span>{t('nextPlayer')}</span>
        <Segmented<'B' | 'W'>
          block
          value={nextPlayer}
          options={[
            {value: 'B', label: t('black')},
            {value: 'W', label: t('white')},
          ]}
          onChange={onNextPlayerChange}
        />
      </label>
    </div>
  );
}

function BoardPreview({board}: {board: ScanBoard}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [availableSize, setAvailableSize] = useState(520);
  const signMap = useMemo(
    () => board.map((row) => row.map((stone): 0 | 1 | -1 => (stone === 1 ? 1 : stone === 2 ? -1 : 0))),
    [board]
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame == null) return;
    const update = () => setAvailableSize(Math.min(frame.clientWidth, frame.clientHeight));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const vertexSize = Math.max(12, Math.floor(availableSize / (board.length + 0.6)));
  return (
    <div ref={frameRef} className="board-recognition-board">
      <Board signMap={signMap} vertexSize={vertexSize} />
    </div>
  );
}

function CropEditor({
  imageUrl,
  crop,
  onChange,
}: {
  imageUrl: string;
  crop: CropRect;
  onChange: (crop: CropRect) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, {x: number; y: number}>());
  const gestureRef = useRef<
    | {kind: 'drag' | 'resize'; start: {x: number; y: number}; crop: CropRect; handle?: string}
    | {kind: 'pinch'; points: [{x: number; y: number}, {x: number; y: number}]; crop: CropRect}
    | null
  >(null);

  function pointForEvent(event: PointerEvent<HTMLDivElement>): {x: number; y: number} {
    const rect = frameRef.current!.getBoundingClientRect();
    return {x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height};
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    const handle = target.dataset.cropHandle;
    if (handle == null && target.closest('.board-recognition-crop-box') == null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointForEvent(event);
    pointersRef.current.set(event.pointerId, point);

    const points = [...pointersRef.current.values()];
    gestureRef.current =
      points.length >= 2
        ? {kind: 'pinch', points: [points[0], points[1]], crop}
        : {kind: handle == null ? 'drag' : 'resize', start: point, crop, handle};
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!pointersRef.current.has(event.pointerId) || gestureRef.current == null) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, pointForEvent(event));
    const gesture = gestureRef.current;

    if (gesture.kind === 'pinch') {
      const points = [...pointersRef.current.values()];
      if (points.length < 2) return;
      const startCenter = midpoint(gesture.points[0], gesture.points[1]);
      const center = midpoint(points[0], points[1]);
      const scale = distance(points[0], points[1]) / Math.max(0.001, distance(gesture.points[0], gesture.points[1]));
      const width = clamp(gesture.crop.width * scale, 0.05, 1);
      const height = clamp(gesture.crop.height * scale, 0.05, 1);
      onChange(
        clampCrop({
          x: gesture.crop.x + gesture.crop.width / 2 + center.x - startCenter.x - width / 2,
          y: gesture.crop.y + gesture.crop.height / 2 + center.y - startCenter.y - height / 2,
          width,
          height,
        })
      );
      return;
    }

    const point = pointersRef.current.get(event.pointerId)!;
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (gesture.kind === 'drag') {
      onChange(clampCrop({...gesture.crop, x: gesture.crop.x + dx, y: gesture.crop.y + dy}));
      return;
    }

    onChange(resizeCrop(gesture.crop, gesture.handle ?? '', dx, dy));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>): void {
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = null;
  }

  return (
    <div className="board-recognition-crop-stage">
      <div
        ref={frameRef}
        className="board-recognition-crop-image"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img src={imageUrl} alt="" draggable={false} />
        <div
          className="board-recognition-crop-box"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
        >
          {['nw', 'ne', 'sw', 'se'].map((handle) => (
            <span key={handle} className={`board-recognition-crop-handle ${handle}`} data-crop-handle={handle} />
          ))}
        </div>
      </div>
    </div>
  );
}

function useBlobUrl(blob: Blob): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return url;
}

async function cropImage(image: Blob, crop: CropRect): Promise<Blob> {
  const bitmap = await createImageBitmap(image, {imageOrientation: 'from-image'});
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * crop.width));
  canvas.height = Math.max(1, Math.round(bitmap.height * crop.height));
  const context = canvas.getContext('2d');
  if (context == null) throw new Error('Canvas is unavailable.');
  context.drawImage(
    bitmap,
    Math.round(bitmap.width * crop.x),
    Math.round(bitmap.height * crop.y),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  bitmap.close();
  const type = image.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob == null ? reject(new Error('Failed to crop image.')) : resolve(blob)), type, 0.95)
  );
}

async function resizeImageForScan(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  if (bitmap.width <= maxScanImageDimension && bitmap.height <= maxScanImageDimension) {
    bitmap.close();
    return image;
  }

  const scale = Math.min(maxScanImageDimension / bitmap.width, maxScanImageDimension / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (context == null) {
    bitmap.close();
    throw new Error('Canvas is unavailable.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const type = image.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob == null ? reject(new Error('Failed to resize image.')) : resolve(blob)), type, 0.95)
  );
}

function createRecognizedGame(
  board: ScanBoard,
  rules: (typeof ruleOptions)[number],
  handicap: number,
  nextPlayer: 'B' | 'W'
): SgfDocument {
  const document = createNewGame(board.length);
  const black: string[] = [];
  const white: string[] = [];
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board.length; x += 1) {
      const point = `${String.fromCharCode(97 + x)}${String.fromCharCode(97 + y)}`;
      if (board[y]?.[x] === 1) black.push(point);
      if (board[y]?.[x] === 2) white.push(point);
    }
  }

  document.root.data.RU = [rules];
  document.root.data.KM = [handicap > 0 ? '0.5' : rules === 'Japanese' || rules === 'Korean' ? '6.5' : '7.5'];
  document.root.data.PL = [nextPlayer];
  if (black.length > 0) document.root.data.AB = black;
  if (white.length > 0) document.root.data.AW = white;
  if (handicap > 0) document.root.data.HA = [String(handicap)];
  const captures = recognizedCaptureCounts(black.length, white.length, handicap, nextPlayer);
  document.root.data.XBC = [String(captures.B)];
  document.root.data.XWC = [String(captures.W)];
  return document;
}

function ruleLabelKey(rules: (typeof ruleOptions)[number]): string {
  return rules === 'New Zealand' ? 'newZealand' : rules.toLowerCase();
}

function defaultNextPlayer(board: ScanBoard): 'B' | 'W' {
  let black = 0;
  let white = 0;
  for (const row of board) {
    for (const stone of row) {
      if (stone === 1) black += 1;
      if (stone === 2) white += 1;
    }
  }
  return white === black - 1 ? 'W' : 'B';
}

function clampCrop(crop: CropRect): CropRect {
  const width = clamp(crop.width, 0.05, 1);
  const height = clamp(crop.height, 0.05, 1);
  return {x: clamp(crop.x, 0, 1 - width), y: clamp(crop.y, 0, 1 - height), width, height};
}

function resizeCrop(crop: CropRect, handle: string, dx: number, dy: number): CropRect {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (handle.includes('w')) left = clamp(crop.x + dx, 0, right - 0.05);
  if (handle.includes('e')) right = clamp(crop.x + crop.width + dx, left + 0.05, 1);
  if (handle.includes('n')) top = clamp(crop.y + dy, 0, bottom - 0.05);
  if (handle.includes('s')) bottom = clamp(crop.y + crop.height + dy, top + 0.05, 1);
  return {x: left, y: top, width: right - left, height: bottom - top};
}

function midpoint(left: {x: number; y: number}, right: {x: number; y: number}) {
  return {x: (left.x + right.x) / 2, y: (left.y + right.y) / 2};
}

function distance(left: {x: number; y: number}, right: {x: number; y: number}): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
