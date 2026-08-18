import { useState } from "react";
import type { Story } from "../lib/stories";

type Props = {
  story: Story;
  others: Story[];
  onPin: (id: string, on: boolean) => void;
  onRename: (id: string, title: string) => void;
  onMerge: (id: string, into: string) => void;
  onReject: (id: string) => void;
  onOpen?: (id: string) => void;
};

export function StoryTools({
  story,
  others,
  onPin,
  onRename,
  onMerge,
  onReject,
  onOpen,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(story.title);
  const mergeable = others.filter((item) => item.id !== story.id);

  function commitRename() {
    const next = title.trim();
    if (next && next !== story.title) onRename(story.id, next);
    setEditing(false);
  }

  return (
    <div className="story-tools">
      {onOpen ? (
        <button type="button" className="story-title" onClick={() => onOpen(story.id)}>
          {story.pinned ? "Pinned · " : null}
          {story.title}
        </button>
      ) : (
        <span className="story-title">
          {story.pinned ? "Pinned · " : null}
          {story.title}
          {story.messages.length > 1 ? ` · ${story.messages.length}` : null}
        </span>
      )}
      {editing ? (
        <input
          className="story-rename"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRename();
            if (event.key === "Escape") {
              setTitle(story.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button type="button" className="text-btn" onClick={() => setEditing(true)}>
          Rename
        </button>
      )}
      <button
        type="button"
        className="text-btn"
        onClick={() => onPin(story.id, !story.pinned)}
      >
        {story.pinned ? "Unpin" : "Pin"}
      </button>
      {mergeable.length > 0 ? (
        <label className="story-merge">
          Merge
          <select
            defaultValue=""
            onChange={(event) => {
              const into = event.target.value;
              event.target.value = "";
              if (into) onMerge(story.id, into);
            }}
          >
            <option value="">into…</option>
            {mergeable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="button" className="text-btn" onClick={() => onReject(story.id)}>
        Not a story
      </button>
    </div>
  );
}
