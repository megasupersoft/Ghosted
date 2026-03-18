# Obsidian Split Panel / Drag-and-Drop System: UX Research Findings

## Research Overview

**Objective**: Understand Obsidian's pane drag-and-drop system in sufficient detail to implement a faithful recreation in Ghosted.

**Methods Used**: Source code analysis of Obsidian v1.12.4 (app.js, app.css extracted from obsidian.asar), official documentation review, API type definitions review, and community theme CSS analysis.

**Confidence Level**: High - findings are based on direct source code analysis, not secondhand descriptions.

---

## 1. Workspace Tree Architecture

Obsidian's workspace is a **recursive tree data structure** where every node is a `WorkspaceItem`. There are two categories:

### Node Types

| Type | Class | Role |
|------|-------|------|
| **WorkspaceRoot** | Root container | Top-level container, extends WorkspaceSplit |
| **WorkspaceSplit** | Branch node | Arranges children **vertically** or **horizontally** |
| **WorkspaceTabs** | Branch node | Displays one child at a time as **tabs** |
| **WorkspaceLeaf** | Leaf node | Contains a single **View** (editor, graph, etc.) |
| **WorkspaceWindow** | Root container | Popout window, contains its own split tree |

### Tree Structure Rules

```
WorkspaceRoot (or WorkspaceWindow)
  -> WorkspaceSplit (direction: "vertical" | "horizontal")
       -> WorkspaceTabs
            -> WorkspaceLeaf (with view)
            -> WorkspaceLeaf (with view)
       -> WorkspaceTabs
            -> WorkspaceLeaf (with view)
  -> WorkspaceSplit (nested split for deeper layouts)
       -> ...
```

**Key constraints:**
- A `WorkspaceLeaf` is always a child of `WorkspaceTabs` (on desktop)
- A `WorkspaceTabs` is always a child of `WorkspaceSplit`
- Splits can nest inside other splits (forming the split tree)
- Left/right sidebars are special splits with max 3 nesting levels; their direct children must be `WorkspaceTabs`
- The `direction` property on `WorkspaceSplit` determines child arrangement:
  - `"vertical"` -> children laid out left-to-right (CSS `flex-direction: row`)
  - `"horizontal"` -> children laid out top-to-bottom (CSS `flex-direction: column`)

### CSS Class Mapping

| Class | Meaning |
|-------|---------|
| `.workspace-split.mod-vertical` | `flex-direction: row` (children side-by-side) |
| `.workspace-split.mod-horizontal` | `flex-direction: column` (children stacked) |
| `.workspace-split.mod-root` | The root split container |
| `.workspace-split.mod-left-split` | Left sidebar split |
| `.workspace-split.mod-right-split` | Right sidebar split |
| `.workspace-tabs` | Tab group container |
| `.workspace-leaf` | Individual pane/view container |
| `.workspace-tab-header-container` | The tab bar at top of a tab group |
| `.workspace-tab-header` | Individual tab in the tab bar |

---

## 2. Drag-and-Drop Mechanics

### Drag Initiation

Dragging is initiated from the **tab header element** (`workspace-tab-header`). The tab header has a native `dragstart` event listener:

```
tabHeaderEl.addEventListener("dragstart", function(e) {
    workspace.onDragLeaf(e, leaf);
});
```

When `onDragLeaf` fires:

1. **Dead zone check**: Drag does not activate until the cursor moves at least 5px from the start position (`m*m + v*v < 25`).
2. **Body class added**: `document.body.addClass("is-grabbing")` -- changes cursor globally to `grabbing`.
3. **Drag ghost created**: A floating element with class `drag-ghost mod-leaf` is created containing:
   - An icon (`drag-ghost-icon`) matching the view's icon
   - A title span (truncated to 60 characters)
4. **Native drag image hidden**: A transparent 1x1 element is set as the native `dataTransfer.setDragImage`, so only the custom ghost shows.
5. **Data transfer**: `dataTransfer.setData("text/plain", "")` -- just the title for external drops.
6. **Deferred view loaded**: If the leaf is deferred (background tab), it's force-loaded via `leaf.loadIfDeferred()`.

### Ghost Element Positioning

The ghost follows the cursor during `dragover`:
- **Desktop**: Ghost is positioned at `clientX + 5, clientY + 5` (offset down-right from cursor)
- **Mobile**: Ghost is positioned at `clientX - width/2, clientY - height - 20` (centered above finger)

### Ghost CSS

```css
.drag-ghost {
  position: fixed;
  font-size: var(--font-ui-small);
  color: var(--drag-ghost-text-color);       /* default: #fff */
  padding: var(--size-2-3) var(--size-4-2);
  border-radius: var(--radius-s);
  background-color: var(--drag-ghost-background); /* default: rgba(0,0,0,0.85) */
  box-shadow: 0 2px 8px var(--background-modifier-box-shadow);
  z-index: var(--layer-dragged-item);
  max-width: 300px;
  font-weight: var(--font-medium);
  pointer-events: none;
}
.drag-ghost.mod-leaf {
  display: flex;
  z-index: var(--layer-tooltip);
}
```

---

## 3. Drop Zone Detection (The Core Algorithm)

### Phase 1: Find the Target Container

The workspace uses `getDropLocation(event)` which calls `recursiveGetTarget(event, split)`:

1. **Hit test the sidebar ribbons/toggles first** -- if cursor is over the left ribbon or left sidebar toggle button, target is `leftSplit`; same for right.
2. **Hit test sidebar containers** -- if cursor is in the left split's container, recurse into it.
3. **Hit test root split** -- recurse into the root split.
4. **Recursion**: For each child of a split, check if the event coordinates are within `child.containerEl` using point-in-rect test (`Nv(e, el)` which checks `getBoundingClientRect()`).
   - If the child is a `WorkspaceTabs` -> return it (it's a valid drop target)
   - If the child is a `WorkspaceSplit` -> recurse deeper
   - If the child is a `WorkspaceLeaf` -> return it

### Phase 2: Calculate Drop Direction

Once a target container is found, `getDropDirection(event, rect, excludeDirections, target)` determines where within that container the drop will happen.

**The algorithm:**

```javascript
// rect = target.containerEl.getBoundingClientRect()
// Compute normalized distances from each edge (0.0 = at edge, 1.0 = at opposite edge)
var a = Math.abs(clientX - rect.x) / rect.width;          // distance from LEFT edge
var s = Math.abs(clientY - rect.y) / rect.height;          // distance from TOP edge
var l = Math.abs(clientX - (rect.x + rect.width)) / rect.width;   // distance from RIGHT edge
var c = Math.abs(clientY - (rect.y + rect.height)) / rect.height; // distance from BOTTOM edge

// Default to "center"
var direction = "center";
var minDistance = 1;

// Check each edge - the threshold is 0.33 (outer third of the pane)
if (s < 0.33 && s < minDistance && !excluded("top")) {
    minDistance = s;
    // Special case for WorkspaceTabs: only show "top" if cursor is in
    // the top 1/3 of the tab header bar itself
    if (target is WorkspaceTabs) {
        if (!stacked && cursor is over tab header container) {
            minDistance = 0;  // force center for tab bar drops
        }
        var headerRect = tabHeaderContainer.getBoundingClientRect();
        if (clientY - rect.y <= headerRect.height / 3) {
            direction = "top";
        } else {
            direction = "center";  // in tab bar but not top edge
        }
    } else {
        direction = "top";
    }
}
if (a < 0.33 && a < minDistance && !excluded("left"))  { minDistance = a; direction = "left"; }
if (l < 0.33 && l < minDistance && !excluded("right")) { minDistance = l; direction = "right"; }
if (c < 0.33 && c < minDistance && !excluded("bottom")){ minDistance = c; direction = "bottom"; }
```

**In plain language:**
- The outer **33% band** on each edge is a split drop zone
- The **inner 33%** (center) is the "add as tab" zone
- If multiple edges compete (corner), the **closest edge wins**
- For `WorkspaceTabs` targets: dropping in the **tab header area** always means "center" (add as tab), unless the cursor is in the very top third of the header (which means "split above")
- For stacked tabs: left and right directions are excluded from the pane body (only center works), because the stacked layout already uses left/right space for tab headers

### Drop Overlay Sizing

Once the direction is determined, the overlay rectangle is adjusted:

```javascript
// d = max(containerWidth or containerHeight / 3, 40px minimum)
// This is the width/height of the drop zone indicator
var d = Math.max(dimension / 3, 40);

switch (direction) {
    case "center":
        // overlay covers the full container
        break;
    case "left":
        rect.width = d;  // narrow strip on left
        break;
    case "top":
        rect.height = d; // narrow strip on top
        break;
    case "right":
        rect.x += rect.width - d;  // narrow strip on right
        rect.width = d;
        break;
    case "bottom":
        rect.y += rect.height - d;  // narrow strip on bottom
        rect.height = d;
        break;
}
```

---

## 4. Visual Feedback During Drag

### The Drop Overlay (`workspace-drop-overlay`)

A single global overlay element is repositioned during drag. It uses CSS transitions for smooth movement:

```css
.workspace-drop-overlay {
  will-change: transform, width, height;
  position: fixed;
  inset-inline-start: 0;
  top: 0;
  width: 0;
  height: 0;
  transform: translate(0, 0);
  transition: all 100ms ease-in-out;   /* smooth transition between drop zones */
  z-index: var(--layer-cover);
  pointer-events: none;
}

/* The actual visible indicator is a ::before pseudo-element */
.workspace-drop-overlay:before {
  content: ' ';
  position: absolute;
  width: calc(100% - 6px);    /* 3px inset on each side */
  height: calc(100% - 6px);   /* 3px inset on each side */
  top: 0; left: 0; bottom: 0; right: 0;
  margin: auto;
  background-color: var(--interactive-accent);  /* accent color fill */
  border-radius: var(--radius-m);
  opacity: 0.5;                                  /* semi-transparent */
}
```

**Behavior:**
- The overlay is positioned via `transform: translate(x, y)` and sized via `width`/`height`
- The `::before` pseudo-element is inset by 3px on all sides, creating a slight padding effect
- The fill is the **accent color at 50% opacity** with rounded corners
- The overlay **smoothly animates** (100ms ease-in-out) between positions as you move the cursor between drop zones
- When the target changes from one pane to another, the overlay transitions smoothly to the new position

### The Fake Target Preview

When dragging to an edge (left/right/top/bottom split), Obsidian shows a **clone preview** of what the layout will look like:

1. The original pane's `containerEl` is cloned: `target.containerEl.cloneNode(true)`
2. The clone is wrapped in the target's parent hierarchy (to preserve CSS context)
3. The clone is placed in a `workspace-fake-target-container` (absolutely positioned, visibility hidden) with a visible child `workspace-fake-target-overlay`
4. The original pane gets `opacity: 0` during the preview
5. The preview is positioned and sized to show the **remaining space** after the split would occur:

```javascript
if ("top" === direction) {
    previewX = rect.x;
    previewY = overlayBottom;          // below the drop overlay
    previewWidth = containerWidth;
    previewHeight = containerHeight - overlayHeight;
}
if ("left" === direction) {
    previewX = overlayRight;           // right of the drop overlay
    previewY = rect.y;
    previewWidth = containerWidth - overlayWidth;
    previewHeight = containerHeight;
}
// ... similar for right, bottom
```

6. When the direction is **"center"** (add as tab), the preview is hidden and the original pane opacity is restored.

### Tab Header Highlighting

When hovering over a specific tab header during drag:

```css
.workspace-tab-header.is-highlighted .workspace-tab-header-inner-icon,
.workspace-tab-header.is-highlighted .workspace-tab-header-inner-title {
  color: var(--tab-text-color-focused-highlighted);
}
```

### Leaf (Pane) Highlighting

When the entire leaf is a valid drop target:

```css
.workspace-leaf.is-highlighted:before {
  content: ' ';
  position: absolute;
  height: 100%;
  width: 100%;
  top: 0;
  inset-inline-start: 0;
  background-color: hsla(var(--interactive-accent-hsl), 0.25);
  z-index: var(--layer-popover);
  pointer-events: none;
}
```

### View Header Highlighting

When a drop targets the view header bar:

```css
.view-header.is-highlighted:after {
  content: ' ';
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  inset-inline-start: 0;
  background-color: hsla(var(--interactive-accent-hsl), 0.5);
}
```

### Grabbing Cursor

During any drag operation:

```css
body.is-grabbing,
body.is-grabbing *:not(.workspace-leaf-resize-handle) {
  cursor: -moz-grabbing !important;
  cursor: -webkit-grabbing !important;
  cursor: grabbing !important;
}
```

---

## 5. Tab Bar Behavior

### Dropping on a Tab Bar (Center Drop Zone)

When the cursor is over the tab header container area and the drop direction resolves to "center":

1. `getTabInsertLocation(clientX)` is called to determine the exact insertion position
2. The algorithm iterates through tab header elements:
   - For each tab, gets its `getBoundingClientRect()`
   - If the cursor X is before the **midpoint** of a tab, insert **before** that tab
   - If cursor X is past the midpoint, insert **after** that tab
   - If the cursor is within the **center 50%** of a tab (within 25% of midpoint), the `droppedIndex` is set (meaning "drop onto this tab" / replace behavior)
3. The overlay is positioned as a **thin 10px-wide vertical bar** at the insertion point, showing where the tab will be inserted:
   ```javascript
   rect = { x: insertX - 5, y: tabY, width: 10, height: tabHeight }
   ```

### Moving Tabs Between Tab Groups

When you drop a tab on a different `WorkspaceTabs` container in the "center" zone:

1. The leaf is removed from its old parent: `oldParent.removeChild(leaf)`
2. The leaf's dimension is reset: `leaf.setDimension(null)`
3. The leaf is inserted at the calculated index: `newTabGroup.insertChild(index, leaf)`
4. The new tab is selected: `newTabGroup.selectTabIndex(...)`
5. Layout resize is requested: `workspace.requestResize()`

### Dropping onto an Existing Tab

If `droppedIndex` is non-null (cursor is centered on an existing tab), the dropped file/link **replaces the content** of that tab (if the tab `canNavigate()`). The tab header gets `is-highlighted` class during hover.

### Reordering Within Same Tab Bar

If the source and destination `WorkspaceTabs` are the same and direction is "center":

1. Calculate insertion index from `getTabInsertLocation(clientX)`
2. If the source tab's index equals the target index, do nothing (no-op)
3. If the index is different:
   - Remove the leaf from the tab group
   - Re-insert at the new index
   - Adjust for index shift (if new index > old index, decrement by 1)
4. Select the moved tab
5. Tab widths animate via a **lock/unlock width system**: before reorder, tab widths are locked to their current pixel values; after reorder, they animate to natural widths over 250ms

---

## 6. Split by Drag (Creating New Splits)

### Dragging to an Edge

When a tab is dragged to the outer 33% of any pane edge:

1. The `getDropDirection` returns `"left"`, `"right"`, `"top"`, or `"bottom"`
2. The drop overlay shows a **strip** (1/3 of the pane dimension, minimum 40px) on that edge
3. A **fake target preview** shows the remaining space as a cloned pane

### On Drop: `splitLeaf()`

The `splitLeaf(target, newLeaf, direction, before)` method handles the tree mutation:

```javascript
function splitLeaf(existingItem, newItem, direction, before) {
    // Find the parent WorkspaceSplit containing the target
    var parentSplit = findParentSplit(existingItem);
    var index = parentSplit.children.indexOf(existingItem);

    if (direction !== parentSplit.direction) {
        // DIFFERENT direction than parent: create a NEW intermediate split
        // e.g., dropping left/right in a vertical stack -> need a new horizontal split
        var newSplit = new WorkspaceSplit(workspace, direction);
        parentSplit.replaceChild(index, newSplit);  // swap target for the new split
        newSplit.setDimension(existingItem.dimension);
        existingItem.setDimension(null);

        if (before) {
            newSplit.insertChild(0, newItem);    // new pane first
            newSplit.insertChild(1, existingItem); // original second
        } else {
            newSplit.insertChild(0, existingItem); // original first
            newSplit.insertChild(1, newItem);      // new pane second
        }
    } else {
        // SAME direction as parent: just insert adjacent
        existingItem.setDimension(existingItem.dimension / 2);
        newItem.setDimension(existingItem.dimension / 2);

        if (before) {
            parentSplit.insertChild(index, newItem);     // before target
        } else {
            parentSplit.insertChild(index + 1, newItem); // after target
        }
    }
}
```

**Direction mapping:**
- `"left"` or `"top"` = `before = true` (new pane goes before existing)
- `"right"` or `"bottom"` = `before = false` (new pane goes after existing)
- `"left"` or `"right"` = `direction = "vertical"` (side-by-side)
- `"top"` or `"bottom"` = `direction = "horizontal"` (stacked)

---

## 7. Edge Cases

### Last Tab Dragged Out of a Pane

When the last leaf is removed from a `WorkspaceTabs`, the tab group becomes empty. The base `WorkspaceParent.removeChild()` handles cleanup:

```javascript
removeChild(child) {
    children.remove(child);
    child.setParent(null);

    if (parent) {
        if (children.length === 1 && !this.allowSingleChild) {
            // Only ONE child left in split: collapse the split
            // Replace this split with its single remaining child
            var remaining = children[0];
            var index = parent.children.indexOf(this);
            parent.replaceChild(index, remaining);
            remaining.setDimension(this.dimension);
        } else if (children.length === 0) {
            // ZERO children: remove this node from parent too (recursive cleanup)
            parent.removeChild(this);
        }
    }
}
```

**Result**: When you drag the last tab out of a pane:
1. The `WorkspaceTabs` becomes empty (0 children)
2. Its parent `WorkspaceSplit` removes the empty `WorkspaceTabs`
3. If the `WorkspaceSplit` now has only 1 child, it collapses: the single remaining child replaces the split
4. This cascades up the tree until the layout is clean

**Important**: `WorkspaceTabs` has `allowSingleChild = true`, so a tab group with 1 tab is fine. But `WorkspaceSplit` does not, so a split with 1 child collapses.

### Dragging a Tab onto Itself

The code explicitly checks: `if (target === leaf.parent && direction === "center" && leaf.parent.children.length === 1)` -- this is a no-op. The overlay is hidden and no action is taken.

### Dragging a Tab into a Split with Only Itself

If the target split has only one child and that child is the dragged leaf: `if (target instanceof WorkspaceSplit && target.children.length === 1 && target.children[0] === dragged)` -- this is also a no-op.

### Dragging to Collapsed Sidebar

If the left/right sidebar is collapsed, the overlay appears over the **sidebar toggle button** instead of the sidebar area:

```javascript
if (target === leftSplit && leftSplit.collapsed) {
    rect = leftSidebarToggleButtonEl.getBoundingClientRect();
}
```

### Dragging Outside the Window (Popout)

On desktop, if a drag ends outside the window (detected via `dragleave` with no `relatedTarget` and `buttons > 0`):

1. A flag `m` is set to true after a brief timeout
2. On cleanup (`dragend`), if the flag is still true:
   - The leaf is removed from its parent
   - A new **popout window** is created at the cursor's screen position
   - The leaf is inserted into the popout
   - Window dimensions match the original pane's `getBoundingClientRect()`

### Sidebar Drop Constraints

When dropping into a sidebar:
- Left/right directions are excluded for sidebar root splits (`excludeDirections = ["left", "right", "top", "bottom"]`)
- Only "center" is allowed for the sidebar root (meaning add as a tab)
- For items already in the sidebar, the `is-in-sidebar` flag is used for CSS styling

---

## 8. Tab Bar Insert Position Indicator

The `getTabInsertLocation(clientX)` method precisely calculates where a new tab will be inserted:

```javascript
function getTabInsertLocation(clientX) {
    var tabHeaders = this.tabHeaderEls;
    var containerRect = this.tabHeaderContainerEl.getBoundingClientRect();
    var insertIndex = tabHeaders.length;  // default: append at end
    var droppedIndex = null;              // which existing tab is being hovered

    for (var i = 0; i < children.length; i++) {
        var tabRect = children[i].tabHeaderEl.getBoundingClientRect();
        var left = tabRect.x;
        var right = tabRect.right;

        if (i === children.length - 1 || clientX <= right) {
            // This is the relevant tab
            var midpoint = (left + right) / 2;

            // If cursor is within center 50% of tab -> "drop onto this tab"
            if (Math.abs(clientX - midpoint) / (right - left) < 0.25) {
                droppedIndex = i;
            }

            // Insert before or after based on midpoint
            insertIndex = i;
            if (clientX > midpoint) {
                insertIndex++;
                indicatorRect.x = right;  // show indicator at right edge
            } else {
                indicatorRect.x = left;   // show indicator at left edge
            }

            indicatorRect = { x: indicatorX - 5, y: tabRect.y, width: 10, height: tabRect.height };
            break;
        }
    }

    return { rect: indicatorRect, index: insertIndex, droppedIndex: droppedIndex };
}
```

**Visual result**: A 10px-wide accent-colored vertical bar appears between tabs showing the insertion point, smoothly sliding as the cursor moves.

---

## 9. Summary of Visual Indicators

| State | Visual | CSS |
|-------|--------|-----|
| **Dragging active** | Grab cursor everywhere | `body.is-grabbing { cursor: grabbing }` |
| **Drag ghost** | Dark rounded pill following cursor with icon + title | `.drag-ghost.mod-leaf` |
| **Edge drop zone** | 1/3-width accent-colored strip on target edge, 50% opacity, rounded corners | `.workspace-drop-overlay::before` |
| **Center drop zone (tab bar)** | 10px-wide accent bar at tab insertion point | `.workspace-drop-overlay::before` (narrow) |
| **Hovering specific tab** | Tab text color changes to highlighted color | `.workspace-tab-header.is-highlighted` |
| **Hovering view header** | Header gets accent overlay at 50% opacity | `.view-header.is-highlighted::after` |
| **Hovering leaf/pane** | Full pane gets accent overlay at 25% opacity | `.workspace-leaf.is-highlighted::before` |
| **Split preview** | Cloned pane shows remaining space after split | `.workspace-fake-target-overlay` |
| **Original pane during split preview** | Faded to opacity: 0 | Inline style on `containerEl` |

---

## 10. Implementation Recommendations for Ghosted

### Data Model

Adopt a similar tree structure:
- `PaneSplit` (direction: vertical/horizontal, children: PaneSplit[] or PaneTabs[])
- `PaneTabs` (children: PaneLeaf[], activeIndex: number)
- `PaneLeaf` (paneType: editor/terminal/graph/canvas/kanban/filetree, viewState)

Store this tree in Zustand. Persist to localStorage.

### Drag System

1. Use native HTML5 drag-and-drop API (like Obsidian does) rather than mouse-based drag
2. Create a single global `DragManager` that:
   - Manages the overlay element
   - Tracks the ghost element
   - Handles `dragstart`, `dragover`, `dragend`, `drop` at the window level
3. Implement the same 33% edge threshold algorithm for drop direction
4. Use CSS transitions on the overlay for smooth movement (100ms ease-in-out)

### Key Differences for Ghosted

Ghosted's current "always mounted, show/hide" pane model differs from Obsidian's tab-based model. Options:
- **Option A**: Keep 6 fixed panes but allow splitting the viewport to show multiple simultaneously, with drag to rearrange which pane is where
- **Option B**: Adopt Obsidian's full tree model where each leaf can hold any pane type, enabling true split/tab flexibility
- **Option C**: Hybrid - keep always-mounted panes but wrap them in a layout tree that controls visibility and positioning

### Priority Implementation Order

1. Layout tree data model (split/tabs/leaf)
2. Drop zone detection algorithm (the 33% threshold math)
3. Visual overlay with CSS transitions
4. Tab reordering within a tab bar
5. Tab movement between tab groups
6. Split-by-drag (creating new splits)
7. Empty pane cleanup (tree collapse)
8. Popout window support (Electron-specific, lower priority)

---

## Source Files Referenced

- `/tmp/obsidian-renderer/app.js` - Obsidian v1.12.4 renderer bundle (minified)
- `/tmp/obsidian-renderer/app.css` - Obsidian v1.12.4 stylesheet
- `https://raw.githubusercontent.com/obsidianmd/obsidian-api/master/obsidian.d.ts` - Public API type definitions
- Official docs: `publish-01.obsidian.md/access/.../User+interface/Tabs.md`
- Official docs: `publish-01.obsidian.md/access/.../Plugins/User+interface/Workspace.md`
