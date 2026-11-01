import { ancestorsOf } from "@/lib/client/file-tree";

// What's open in the viewer: tabs, the visited-files trail, expanded tree folders and the position
// to scroll to. Every way of opening a file goes through `open`, so a go-to-definition into another
// file moves the tree, tabs and trail exactly as a click in the tree does.

export interface RevealTarget {
  path: string;
  line: number;
  col: number;
  /** Changes on each request, so revealing the same line twice still scrolls. */
  nonce: number;
}

export interface NavigationState {
  tabs: string[];
  activePath: string | null;
  trail: string[];
  expanded: string[];
  reveal: RevealTarget | null;
  nonce: number;
}

export type NavigationAction =
  | { type: "open"; path: string; line?: number; col?: number }
  | { type: "close"; path: string }
  | { type: "toggle-dir"; path: string };

export const TRAIL_LIMIT = 12;

export const initialNavigation: NavigationState = {
  tabs: [],
  activePath: null,
  trail: [],
  expanded: [],
  reveal: null,
  nonce: 0,
};

function nextTrail(trail: string[], path: string): string[] {
  if (trail[trail.length - 1] === path) return trail;
  return [...trail.filter((visited) => visited !== path), path].slice(-TRAIL_LIMIT);
}

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case "open": {
      const nonce = state.nonce + 1;
      const expanded = new Set(state.expanded);
      for (const dir of ancestorsOf(action.path)) expanded.add(dir);
      return {
        ...state,
        tabs: state.tabs.includes(action.path) ? state.tabs : [...state.tabs, action.path],
        activePath: action.path,
        trail: nextTrail(state.trail, action.path),
        expanded: [...expanded],
        nonce,
        reveal:
          action.line === undefined
            ? null
            : { path: action.path, line: action.line, col: action.col ?? 1, nonce },
      };
    }
    case "close": {
      const index = state.tabs.indexOf(action.path);
      if (index === -1) return state;
      const tabs = state.tabs.filter((tab) => tab !== action.path);
      const activePath =
        state.activePath === action.path
          ? (tabs[Math.min(index, tabs.length - 1)] ?? null)
          : state.activePath;
      return { ...state, tabs, activePath, reveal: null };
    }
    case "toggle-dir":
      return {
        ...state,
        expanded: state.expanded.includes(action.path)
          ? state.expanded.filter((dir) => dir !== action.path)
          : [...state.expanded, action.path],
      };
  }
}
