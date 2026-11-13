import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { playMessageSound, playQueueSound } from './sound';

const QUEUE_VOLUME_KEY = 'helpdesk-queue-volume';
const MESSAGE_VOLUME_KEY = 'helpdesk-message-volume';
const DEFAULT_VOLUME = 70;

function loadVolume(key: string): number {
  const raw = localStorage.getItem(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_VOLUME;
}

interface SoundContextValue {
  queueVolume: number;
  messageVolume: number;
  setQueueVolume: (v: number) => void;
  setMessageVolume: (v: number) => void;
  playQueue: () => void;
  playMessage: () => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [queueVolume, setQueueVolume] = useState(() => loadVolume(QUEUE_VOLUME_KEY));
  const [messageVolume, setMessageVolume] = useState(() => loadVolume(MESSAGE_VOLUME_KEY));

  useEffect(() => {
    localStorage.setItem(QUEUE_VOLUME_KEY, String(queueVolume));
  }, [queueVolume]);

  useEffect(() => {
    localStorage.setItem(MESSAGE_VOLUME_KEY, String(messageVolume));
  }, [messageVolume]);

  return (
    <SoundContext.Provider
      value={{
        queueVolume,
        messageVolume,
        setQueueVolume,
        setMessageVolume,
        playQueue: () => playQueueSound(queueVolume),
        playMessage: () => playMessageSound(messageVolume),
      }}
    >
      {children}
    </SoundContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound precisa ser usado dentro de <SoundProvider>.');
  return ctx;
}
