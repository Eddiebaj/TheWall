import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_SAVED_BOARD } from '../lib/storageKeys';
import type { SavedBoardItem } from '../lib/homeConstants';
import { trackEvent } from '../lib/analytics';

interface BoardContextValue {
  savedBoard: SavedBoardItem[];
  boardLoaded: boolean;
  addToBoard: (item: SavedBoardItem) => void;
  addToBoardIfMissing: (item: SavedBoardItem) => void;
  removeFromBoard: (index: number) => void;
  reorderBoard: (from: number, to: number) => void;
  refreshBoard: () => Promise<void>;
}

const BoardContext = createContext<BoardContextValue>({
  savedBoard: [],
  boardLoaded: false,
  addToBoard: () => {},
  addToBoardIfMissing: () => {},
  removeFromBoard: () => {},
  reorderBoard: () => {},
  refreshBoard: async () => {},
});

export function useBoard() {
  return useContext(BoardContext);
}

function itemKey(item: SavedBoardItem): string {
  if ('id' in item) return `${item.type}-${item.id}`;
  return item.type;
}

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [savedBoard, setSavedBoard] = useState<SavedBoardItem[]>([]);
  const [boardLoaded, setBoardLoaded] = useState(false);

  const persist = useCallback((board: SavedBoardItem[]) => {
    AsyncStorage.setItem(SK_SAVED_BOARD, JSON.stringify(board)).catch(() => {});
  }, []);

  const refreshBoard = useCallback(async () => {
    console.log('[BoardProvider] refreshBoard start');
    try {
      const raw = await AsyncStorage.getItem(SK_SAVED_BOARD);
      console.log('[BoardProvider] AsyncStorage.getItem(SK_SAVED_BOARD) resolved, raw=', raw ? `${raw.length} chars` : 'null');
      if (raw) setSavedBoard(JSON.parse(raw));
      else setSavedBoard([]);
    } catch (e) {
      console.warn('[BoardProvider] refreshBoard error:', e);
      setSavedBoard([]);
    }
    console.log('[BoardProvider] refreshBoard complete, boardLoaded=true');
    setBoardLoaded(true);
  }, []);

  useEffect(() => { refreshBoard(); }, [refreshBoard]);

  const addToBoard = useCallback((item: SavedBoardItem) => {
    trackEvent('stop_saved');
    setSavedBoard(prev => {
      const next = [...prev, item];
      persist(next);
      return next;
    });
  }, [persist]);

  const addToBoardIfMissing = useCallback((item: SavedBoardItem) => {
    setSavedBoard(prev => {
      const key = itemKey(item);
      if (prev.some(existing => itemKey(existing) === key)) return prev;
      const next = [...prev, item];
      persist(next);
      return next;
    });
  }, [persist]);

  const removeFromBoard = useCallback((index: number) => {
    setSavedBoard(prev => {
      const next = prev.filter((_, i) => i !== index);
      persist(next);
      return next;
    });
  }, [persist]);

  const reorderBoard = useCallback((from: number, to: number) => {
    setSavedBoard(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <BoardContext.Provider value={{ savedBoard, boardLoaded, addToBoard, addToBoardIfMissing, removeFromBoard, reorderBoard, refreshBoard }}>
      {children}
    </BoardContext.Provider>
  );
}
