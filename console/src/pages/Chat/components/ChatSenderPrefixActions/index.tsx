import type { ReactNode } from "react";
import styles from "./index.module.less";

interface ChatSenderPrefixActionsProps {
  whisper?: ReactNode;
  environmentSelector: ReactNode;
  runModeSelector?: ReactNode;
  loopModeSelector?: ReactNode;
}

export default function ChatSenderPrefixActions({
  whisper,
  environmentSelector,
  runModeSelector,
  loopModeSelector,
}: ChatSenderPrefixActionsProps) {
  return (
    <div className={styles.prefixRow}>
      {runModeSelector}
      {whisper}
      {loopModeSelector}
      {environmentSelector}
    </div>
  );
}
