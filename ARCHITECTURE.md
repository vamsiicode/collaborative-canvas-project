# Architecture Decisions

This document explains the technical choices made for the Real-Time Collaborative Canvas.

## 1. Data Flow Diagram

The drawing flow is a "client-server-client" broadcast. The server is the single source of truth, but we use client-side prediction for a lag-free experience for the person drawing.


1.  **User A `mousedown`:** `currentStroke` object is created in `canvas.js`.
2.  **User A `mousemove`:**
    * The new point is added to `currentStroke`.
    * **Local Prediction:** `fullRedraw()` is called *locally*. This only draws the `currentStroke` (and other "in-progress" items) on top of the static history, making it lag-free.
    * **Broadcast:** `WebSocketClient.sendDrawingData()` sends the new point to the server.
3.  **Server `drawing_data`:** The server receives the point and *immediately* broadcasts it to all *other* users via a `remote_drawing` message.
4.  **User B `remote_drawing`:** User B receives the point and adds it to their `inProgressDrawings` map. `fullRedraw()` is called, showing User A's "ghost" drawing.
5.  **User A `mouseup`:** `WebSocketClient.sendStrokeComplete()` sends the *entire* line (all points, color, etc.) to the server.
6.  **Server `stroke_complete`:**
    * The server adds the stroke to the `globalHistory`.
    * It broadcasts `stroke_finalized` to *all* clients (including User A).
7.  **All Clients `stroke_finalized`:**
    * The stroke is "baked" into the `staticCanvas` (the in-memory history).
    * `currentStroke` (for User A) or `inProgressDrawings[UserA]` (for User B) is cleared.
    * This "commits" the line to history for everyone.

## 2. WebSocket Protocol

The protocol is a simple JSON-based messaging system.

| Event Name | Direction | Data | Description |
| :--- | :--- | :--- | :--- |
| `init` | Server -> Client | `{ history: [], currentUser: {} }` | Sent on connection. Gives the new user the entire drawing history and their assigned user object. |
| `user_list_update` | Server -> Client | `[User, ...]` | Sent when anyone joins or leaves. |
| `drawing_data` | Client -> Server | `{...pointData}` | High-frequency "streaming" message sent on `mousemove`. |
| `remote_drawing` | Server -> Client | `{...pointData, user: {} }` | Server broadcasts the `drawing_data` to all other clients. |
| `stroke_complete` | Client -> Server | `{...strokeObject}` | Sent on `mouseup` with the complete, batched stroke. |
| `stroke_finalized` | Server -> Client | `{...strokeObjectWithId}` | Server confirms a stroke is added to history. *All* clients receive this. |
| `cursor_move` | Client -> Server | `{ x: Number, y: Number }` | Sends the user's cursor position. |
| `remote_cursor_move`| Server -> Client | `{ x, y, userId }` | Server broadcasts cursor data to other clients. |
| `undo` | Client -> Server | (none) | Requests a global undo. |
| `undo_broadcast` | Server -> Client | `strokeId` | Server tells all clients to remove this stroke from history. |
| `redo` | Client -> Server | (none) | Requests a global redo. |
| `redo_broadcast` | Server -> Client | `{...strokeObjectWithId}` | Server tells all clients to re-add this stroke. |

## 3. Performance Decisions

**The primary performance bottleneck was lag during drawing.**

* **Problem:** The initial design called `fullRedraw()` on `mousemove`. This function re-drew every single stroke in `globalHistory` just to add one new point, causing extreme lag as the history grew.
* **Solution: In-Memory Static Canvas**
    * We use a single *visible* `<canvas>` element.
    * However, in `canvas.js`, we create a *second, in-memory* canvas: `staticCanvas`.
    * All *finished* strokes (from `globalHistory`) are "baked" onto this `staticCanvas` using `staticCtx.drawStroke(...)`.
    * The `fullRedraw()` function (which *is* still called on `mousemove`) is now extremely fast. It performs two steps:
        1.  `ctx.drawImage(staticCanvas, 0, 0)`: A single, hardware-accelerated operation to copy the *entire* history to the visible canvas.
        2.  It then draws the few *dynamic* items on top (the user's `currentStroke` and any `inProgressDrawings`).
    * This gives us the performance of a two-canvas system without complicating the HTML or CSS.

## 4. Undo/Redo Strategy

The strategy is a simple **Global Stack**, managed by the server.

* `server/drawing-state.js` maintains two arrays: `history` and `undoneHistory`.
* **On `undo`:** The server `pop()`s the last stroke from `history`, `push()`es it onto `undoneHistory`, and broadcasts the `strokeId` to all clients. Clients then filter this `strokeId` from their local `globalHistory` and call `rebuildStaticCanvas()`.
* **On `redo`:** The server `pop()`s from `undoneHistory`, `push()`es it onto `history`, and broadcasts the *full stroke object*. Clients add this to their `globalHistory` and call `rebuildStaticCanvas()`.
* **Limitation:** This is "Last-In, First-Out" for the *entire server*. It's simple, but not a good user experience, as one user can undo another's work.

## 5. Conflict Resolution

* **Drawing:** **Last Write Wins.** Since we are just streaming pixels/points, there is no real "conflict." If two users draw in the same spot, the last data to be rendered on the client's screen "wins." This is acceptable for this project.
* **State:** **Server is the Single Source of Truth.** The `init` event and the `stroke_finalized` events ensure that all clients' `globalHistory` arrays are *eventually consistent* with the server's. This prevents any long-term "desync" bugs.
* **Race Conditions:** We fixed a major race condition ("the disappearing line") by:
    1.  Assigning a `localId` (a timestamp) to a stroke on `mousedown`.
    2.  On `stopDrawing`, moving `currentStroke` into the `inProgressDrawings` map (keyed by `localId`) instead of nullifying it. This keeps it on-screen.
    3.  When `handleStrokeFinalized` is called, we use the `localId` to find and delete the correct "in-progress" line, preventing a new line from being accidentally cleared.
