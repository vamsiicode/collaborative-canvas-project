// collaborative-canvas/server/drawing-state.js

/**
 * Stores the global drawing history (strokes) and manages undo/redo.
 * A "stroke" is an object representing a single complete drawing action.
 * {
 * id: string, // Unique ID for the stroke
 * userId: string,
 * tool: 'brush' | 'eraser',
 * color: string,
 * width: number,
 * points: Array<{x: number, y: number}>,
 * timestamp: number
 * }
 */
const history = [];
let nextStrokeId = 1;

// Stores strokes that have been undone
const undoneHistory = [];

function addStroke(strokeData) {
    const newStroke = {
        id: (nextStrokeId++).toString(),
        timestamp: Date.now(),
        ...strokeData
    };
    history.push(newStroke);
    // Clear redo history on new action
    undoneHistory.length = 0;
    return newStroke;
}

function getHistory() {
    return history;
}

function undoLastAction(userId) {
    // Implement global undo/redo logic
    if (history.length === 0) return null;

    // Get the last stroke and move it to the undone stack
    const lastStroke = history.pop();
    undoneHistory.push(lastStroke);
    
    // In a real application, conflict resolution for global undo/redo 
    // (e.g., if User A undid User B's action) is complex. 
    // This simple implementation performs a global undo regardless of who drew it.
    
    return lastStroke; // Return the stroke that was removed
}

function redoLastAction(userId) {
    if (undoneHistory.length === 0) return null;

    // Move the stroke back to the main history stack
    const redoneStroke = undoneHistory.pop();
    history.push(redoneStroke);
    
    return redoneStroke; // Return the stroke that was re-added
}

function clearState() {
    history.length = 0;
    undoneHistory.length = 0;
    nextStrokeId = 1;
}

module.exports = {
    addStroke,
    getHistory,
    undoLastAction,
    redoLastAction,
    clearState
};