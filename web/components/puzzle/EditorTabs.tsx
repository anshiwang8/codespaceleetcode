import styles from "@/components/puzzle/puzzle.module.css";
import { Icon } from "@/components/site/Icon";

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

interface EditorTabsProps {
  tabs: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({ tabs, activePath, onSelect, onClose }: EditorTabsProps) {
  if (tabs.length === 0) return <div className={styles.tabsEmpty} />;
  return (
    <div className={styles.tabs} role="tablist" aria-label="Open files" data-testid="editor-tabs">
      {tabs.map((path) => (
        <div key={path} className={path === activePath ? styles.tabActive : styles.tab}>
          <button
            type="button"
            role="tab"
            aria-selected={path === activePath}
            title={path}
            data-testid="editor-tab"
            data-path={path}
            className={styles.tabLabel}
            onClick={() => onSelect(path)}
          >
            {baseName(path)}
          </button>
          <button
            type="button"
            aria-label={`Close ${path}`}
            className={styles.tabClose}
            onClick={() => onClose(path)}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
