const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '😢', '😮', '😡', '🎉', '❤️', '🔥', '👏', '🤔', '😴', '💯', '👀'];

export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 6,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 4,
        boxShadow: 'var(--shadow-md)',
        zIndex: 50,
      }}
      onMouseLeave={onClose}
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
