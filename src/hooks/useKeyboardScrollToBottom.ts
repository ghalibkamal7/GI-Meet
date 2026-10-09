import { useEffect, type RefObject } from 'react';
import { isNativePlatform } from '../utils/platform';

export function useKeyboardScrollToBottom(scrollRef: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!isNativePlatform()) return;
    let removeListener: (() => void) | undefined;

    (async () => {
      const { Keyboard } = await import('@capacitor/keyboard');
      const sub = await Keyboard.addListener('keyboardDidShow', () => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
      removeListener = () => sub.remove();
    })();

    return () => removeListener?.();
  }, [scrollRef]);
}