import type {AnalysisSettings} from '@ulugo/analysis-core';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {AnalysisToolbarOptions} from '../toolbar/AnalysisToolbarOptions';
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
  katagoEnabled: boolean;
  analysisSettings: AnalysisSettings;
  stoneOverlayDisplay: AnalysisSettings['stoneOverlay'];
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
  onModeChange: (mode: AnalysisSettings['mode']) => void;
  onAnalysisSettingsChange: (values: Partial<AnalysisSettings>) => void;
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
  katagoEnabled,
  analysisSettings,
  stoneOverlayDisplay,
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
  onModeChange,
  onAnalysisSettingsChange,
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
      <AnalysisToolbarOptions
        katagoEnabled={katagoEnabled}
        analysisSettings={analysisSettings}
        stoneOverlayDisplay={stoneOverlayDisplay}
        onModeChange={onModeChange}
        onSettingsChange={onAnalysisSettingsChange}
      />
    </div>
  );
}
