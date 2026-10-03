"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

export type DragHandleProps = HTMLAttributes<HTMLButtonElement> & { "aria-label": string };

function SortableRow({
  id,
  children,
  label,
  className,
}: {
  id: string;
  children: (handle: ReactNode, dragging: boolean) => ReactNode;
  label: string;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${label}`}
      className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring active:cursor-grabbing"
    >
      <GripVertical aria-hidden size={16} strokeWidth={1.5} />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-80", className)}
    >
      {children(handle, isDragging)}
    </li>
  );
}

/**
 * Drag-and-drop list (mouse, touch and keyboard: focus the handle, press
 * space, move with the arrow keys, space again to drop). Calls onReorder with
 * the new id order.
 */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  className,
  itemClassName,
}: {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: ReactNode, dragging: boolean) => ReactNode;
  className?: string;
  itemClassName?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={cn("flex flex-col gap-2", className)}>
          {items.map((item) => (
            <SortableRow key={getId(item)} id={getId(item)} label={getLabel(item)} className={itemClassName}>
              {(handle, dragging) => renderItem(item, handle, dragging)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
