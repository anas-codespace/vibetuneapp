import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Loader2, Trash2, X } from "lucide-react";
import { usePlayer } from "@/components/VibePlayer";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface QueueRow {
  id: string;
  absoluteIdx: number;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
}

function SortableQueueItem({
  row,
  onPlay,
  onRemove,
}: {
  row: QueueRow;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl p-2 hover:bg-white/5"
    >
      <button
        type="button"
        aria-label={`Reorder ${row.title}`}
        className="grid h-9 w-6 shrink-0 cursor-grab place-items-center text-white/40 hover:text-white/70 active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
          {row.thumbnailUrl ? (
            <img src={row.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="vibe-gradient h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white">{row.title}</p>
          <p className="truncate text-xs text-white/50">{row.artist}</p>
        </div>
      </button>
      <button
        onClick={onRemove}
        aria-label={`Remove ${row.title}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

export function QueueDrawer({ open, onClose }: Props) {
  const { current, queue, index, isLoadingNext, removeFromQueue, reorderQueue, jumpToQueueIndex } =
    usePlayer();

  const upNext: QueueRow[] = queue.slice(index + 1).map((t, i) => {
    const absoluteIdx = index + 1 + i;
    return {
      id: `${t.youtubeId}-${absoluteIdx}`,
      absoluteIdx,
      youtubeId: t.youtubeId,
      title: t.title,
      artist: t.artist,
      thumbnailUrl: t.thumbnailUrl,
    };
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = upNext.findIndex((r) => r.id === active.id);
    const to = upNext.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    // arrayMove is applied inside global state via absolute indices.
    const reordered = arrayMove(upNext, from, to);
    // Compute absolute source/target: original absoluteIdx of dragged item -> target absoluteIdx.
    const fromAbs = upNext[from].absoluteIdx;
    const toAbs = reordered.findIndex((r) => r.id === active.id) + index + 1;
    reorderQueue(fromAbs, toAbs);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[85vh] flex-col rounded-t-3xl border-t border-white/10 bg-[#0B0B0B] pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-label="Up next queue"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
            <header className="flex items-center justify-between px-5 py-3">
              <h2 className="text-lg font-bold text-white">Up Next</h2>
              <button
                onClick={onClose}
                aria-label="Close queue"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto px-5 pb-6">
              {current && (
                <section className="mb-6">
                  <p className="vibe-text mb-2 text-[10px] font-bold uppercase tracking-[0.25em]">
                    Now Playing
                  </p>
                  <div className="glass-strong gradient-border flex items-center gap-3 rounded-2xl p-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                      {current.thumbnailUrl ? (
                        <img src={current.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="vibe-gradient h-full w-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{current.title}</p>
                      <p className="truncate text-xs text-white/50">{current.artist}</p>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <p className="vibe-text mb-2 text-[10px] font-bold uppercase tracking-[0.25em]">
                  Next in Queue
                </p>
                {upNext.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-white/40">
                    Nothing in the queue. Add some vibes!
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={upNext.map((r) => r.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-1">
                        {upNext.map((row) => (
                          <SortableQueueItem
                            key={row.id}
                            row={row}
                            onPlay={() => jumpToQueueIndex(row.absoluteIdx)}
                            onRemove={() => removeFromQueue(row.absoluteIdx)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
