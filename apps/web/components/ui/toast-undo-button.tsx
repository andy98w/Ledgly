interface ToastUndoButtonProps {
  onClick: () => void;
  label?: string;
}

export function ToastUndoButton({ onClick, label = 'Undo' }: ToastUndoButtonProps) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
    >
      {label}
    </button>
  );
}
