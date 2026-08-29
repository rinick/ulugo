import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {EditorToolbar} from '../toolbar/EditorToolbar';
import {MarkupToolbar} from '../toolbar/MarkupToolbar';
import {NavigationToolbar} from '../toolbar/NavigationToolbar';
import type {EditorTool, MoveEditAction} from '../toolbar/types';

interface AppToolbarsProps {
  tool: EditorTool;
  nextColor: 'B' | 'W';
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  canEditMoves: boolean;
  moveEditAction: MoveEditAction;
  showMarkup: boolean;
  labelText: string;
  shortcutLabels: Partial<Record<ShortcutActionId, string>>;
  onToolChange: (tool: EditorTool) => void;
  onMoveEditActionChange: (action: MoveEditAction) => void;
  onLabelTextChange: (value: string) => void;
  onAutoToolClick: () => void;
  onEraseAllMarkup: () => void;
  onPass: () => void;
  onFirst: () => void;
  onPrevious10: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onNext10: () => void;
  onLast: () => void;
}

export function AppToolbars({
  tool,
  nextColor,
  canNavigatePrevious,
  canNavigateNext,
  canEditMoves,
  moveEditAction,
  showMarkup,
  labelText,
  shortcutLabels,
  onToolChange,
  onMoveEditActionChange,
  onLabelTextChange,
  onAutoToolClick,
  onEraseAllMarkup,
  onPass,
  onFirst,
  onPrevious10,
  onPrevious,
  onNext,
  onNext10,
  onLast,
}: AppToolbarsProps) {
  return (
    <div className="editor-toolbar">
      <EditorToolbar
        tool={tool}
        nextColor={nextColor}
        canEditMoves={canEditMoves}
        moveEditAction={moveEditAction}
        shortcutLabels={shortcutLabels}
        onToolChange={onToolChange}
        onMoveEditActionChange={onMoveEditActionChange}
        onAutoToolClick={onAutoToolClick}
        onPass={onPass}
      />
      {showMarkup ? (
        <MarkupToolbar
          tool={tool}
          labelText={labelText}
          shortcutLabels={shortcutLabels}
          onToolChange={onToolChange}
          onLabelTextChange={onLabelTextChange}
          onEraseAllMarkup={onEraseAllMarkup}
        />
      ) : null}
      <NavigationToolbar
        canNavigatePrevious={canNavigatePrevious}
        canNavigateNext={canNavigateNext}
        shortcutLabels={shortcutLabels}
        onFirst={onFirst}
        onPrevious10={onPrevious10}
        onPrevious={onPrevious}
        onNext={onNext}
        onNext10={onNext10}
        onLast={onLast}
      />
    </div>
  );
}
