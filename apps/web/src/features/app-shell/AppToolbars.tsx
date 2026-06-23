import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {EditorToolbar} from '../toolbar/EditorToolbar';
import {NavigationToolbar} from '../toolbar/NavigationToolbar';
import type {EditorTool} from '../toolbar/types';

interface AppToolbarsProps {
  tool: EditorTool;
  nextColor: 'B' | 'W';
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  canReplaceMove: boolean;
  showMarkup: boolean;
  labelText: string;
  shortcutLabels: Partial<Record<ShortcutActionId, string>>;
  onToolChange: (tool: EditorTool) => void;
  onLabelTextChange: (value: string) => void;
  onAutoToolClick: () => void;
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
  canReplaceMove,
  showMarkup,
  labelText,
  shortcutLabels,
  onToolChange,
  onLabelTextChange,
  onAutoToolClick,
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
        canReplaceMove={canReplaceMove}
        showMarkup={showMarkup}
        labelText={labelText}
        shortcutLabels={shortcutLabels}
        onToolChange={onToolChange}
        onLabelTextChange={onLabelTextChange}
        onAutoToolClick={onAutoToolClick}
        onPass={onPass}
      />
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
