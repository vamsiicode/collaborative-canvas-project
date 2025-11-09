// collaborative-canvas/client/canvas.js

let canvas, ctx;

// --- THE FIX (PART 1: PERFORMANCE) ---
// This is an in-memory canvas that holds all the *finished* drawings.
// This is the "bottom layer" that fixes the lag.
let staticCanvas, staticCtx;
// ---------------------------------

let isDrawing = false;
let currentStroke = null;
let currentTool = 'brush';
let currentColor = '#000000';
let currentWidth = 5;

// Global array to store all finalized strokes
const globalHistory = []; 

// Temporary map to store *in-progress* remote drawings (Real-Time Sync)
const inProgressDrawings = {};
// Map to store remote user cursor positions for User Indicators
const remoteCursors = {};

/**
 * Re-draws the *entire* static (in-memory) canvas from history.
 * This is slow, but we only call it on undo/redo or history load.
 */
function rebuildStaticCanvas() {
    // --- ERASER FIX: Ensure white background ---
    staticCtx.fillStyle = '#FFFFFF';
    staticCtx.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
    // ------------------------------------------

    for (const stroke of globalHistory) {
        // Draw the stroke onto the *static* context
        CanvasManager.drawStroke(staticCtx, stroke);
    }
}


const CanvasManager = {
    init: (canvasElementId) => {
        canvas = document.getElementById(canvasElementId);
        ctx = canvas.getContext('2d');
        
        // --- THE FIX (PART 1) ---
        // Create the in-memory canvas
        staticCanvas = document.createElement('canvas');
        staticCtx = staticCanvas.getContext('2d');
        // ---------------------------------

        // Set initial size for *both* canvases
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        canvas.width = width;
        canvas.height = height;
        staticCanvas.width = width;
        staticCanvas.height = height;
        
        // --- ERASER FIX: Ensure white background ---
        staticCtx.fillStyle = '#FFFFFF';
        staticCtx.fillRect(0, 0, width, height);
        // ------------------------------------------

        // Event listeners for drawing
        canvas.addEventListener('mousedown', CanvasManager.startDrawing);
        canvas.addEventListener('mousemove', CanvasManager.draw);
        canvas.addEventListener('mouseup', CanvasManager.stopDrawing);
        canvas.addEventListener('mouseleave', CanvasManager.stopDrawing);

        canvas.addEventListener('mousemove', (e) => {
            // Send cursor position frequently
            if (typeof WebSocketClient !== 'undefined' && WebSocketClient.getCurrentUser()) {
                WebSocketClient.sendCursorMove({ x: e.offsetX, y: e.offsetY });
            }
        });
        
        // Initial full redraw (will be fast)
        CanvasManager.fullRedraw();
    },

    // --- Core Drawing Logic ---

    /**
     * This is now the FAST redraw function.
     * It just copies the static canvas and draws the few
     * in-progress items on top.
     */
    fullRedraw: () => {
        // 1. Clear the *visible* canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 2. Draw the *entire history* in one fast operation
        ctx.drawImage(staticCanvas, 0, 0);

        // 3. Draw all "dynamic" (in-progress) items on top
        
        // Draw the user's *own* current stroke
        if (currentStroke) {
            CanvasManager.drawStroke(ctx, currentStroke);
        }

        // Draw all in-progress remote drawings
        for (const drawing of Object.values(inProgressDrawings)) {
            CanvasManager.drawStroke(ctx, drawing);
        }
        
        // Draw all user cursors (User Indicators)
        CanvasManager.drawCursors();
    },

    /**
     * This helper draws a stroke to *any* context.
     * It now includes the correct eraser logic.
     */
    drawStroke: (context, stroke) => { // Removed 'isFinal'
        if (!stroke || stroke.points.length < 2) return;

        context.beginPath();
        context.lineCap = 'round';
        context.lineJoin = 'round';

        // --- ERASER FIX ---
        // Use globalCompositeOperation for a real eraser
        if (stroke.tool === 'eraser') {
            context.globalCompositeOperation = 'destination-out';
            context.strokeStyle = '#FFFFFF'; // Color doesn't matter
        } else {
            context.globalCompositeOperation = 'source-over';
            context.strokeStyle = stroke.color;
        }
        // ------------------

        context.lineWidth = stroke.width;
        
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            context.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        context.stroke();
        
        // Reset to default
        context.globalCompositeOperation = 'source-over';
    },
    
    drawCursors: () => {
        // Check if mainApp is available before using it
        if (typeof mainApp !== 'undefined' && mainApp.getUserById) {
            for (const [userId, cursor] of Object.entries(remoteCursors)) {
                const user = mainApp.getUserById(userId);
                if (!user) continue;
                
                ctx.fillStyle = user.color || '#000000';
                ctx.fillRect(cursor.x - 5, cursor.y - 5, 10, 10);
                ctx.font = '10px sans-serif';
                ctx.fillText(user.username, cursor.x + 10, cursor.y);
            }
        }
    },

    // --- Local Mouse Events ---

    startDrawing: (e) => {
        if (!WebSocketClient.getCurrentUser()) return; // Wait for connection
        isDrawing = true;
        const startPoint = { x: e.offsetX, y: e.offsetY };
        
        currentStroke = {
            localId: Date.now(), // --- FIX 2: Add localId for race condition
            userId: WebSocketClient.getCurrentUser().id,
            tool: currentTool,
            color: currentColor,
            width: currentWidth,
            points: [startPoint]
        };
        
        // Begin drawing locally immediately
        CanvasManager.drawStroke(ctx, currentStroke); // Draw on visible canvas
        WebSocketClient.sendDrawingData(startPoint);
    },

    draw: (e) => {
        if (!isDrawing || !currentStroke) return; // Check for currentStroke
        
        const newPoint = { x: e.offsetX, y: e.offsetY };
        currentStroke.points.push(newPoint);
        
        // Real-time sync: Broadcast the point immediately
        WebSocketClient.sendDrawingData(newPoint);
        
        // --- THE LAG FIX ---
        // This is now fast because fullRedraw() only copies one image
        // and draws one line.
        CanvasManager.fullRedraw();
    },

    stopDrawing: () => {
        if (!isDrawing || !currentStroke) return;
        isDrawing = false;
        
        // Batched stroke event: Send the complete stroke data to the server
        WebSocketClient.sendStrokeComplete(currentStroke);
        
        // --- THE DISAPPEARING LINE FIX ---
        // We do *not* nullify currentStroke here.
        // Instead, we move it to inProgressDrawings to keep it on screen
        // until the server confirms it.
        inProgressDrawings[currentStroke.localId] = currentStroke;
        currentStroke = null;
    },

    // --- Remote Events Handlers ---

    handleRemoteDrawing: (pointData) => {
        // --- FIX: Don't draw our own remote stream ---
        if (pointData.userId === WebSocketClient.getCurrentUser().id) {
            return;
        }

        const { userId, x, y } = pointData;
        
        if (!inProgressDrawings[userId]) {
            if (typeof mainApp === 'undefined' || !mainApp.getUserById) return;
            const user = mainApp.getUserById(userId);
            if (!user) return; // Ignore if user is unknown

            inProgressDrawings[userId] = {
                userId,
                tool: 'brush', // Assuming brush for simplicity
                color: user.color || '#000000',
                width: 5, // Use a default/sent width
                points: []
            };
        }
        
        inProgressDrawings[userId].points.push({ x, y });
        CanvasManager.fullRedraw();
    },
    
    handleStrokeFinalized: (stroke) => {
        // A user finished drawing (could be us or remote)
        
        // Add to history and "bake" it onto the static canvas
        CanvasManager.addFinalStroke(stroke);

        // --- THE DISAPPEARING LINE FIX (PART 2) ---
        // Check if it was our own stroke by localId
        if (inProgressDrawings[stroke.localId]) {
            // It was ours. Clear it from in-progress.
            delete inProgressDrawings[stroke.localId];
        } else {
            // It was a remote stroke. Clear it by userId.
            delete inProgressDrawings[stroke.userId];
        }
        // ------------------------------------------

        CanvasManager.fullRedraw();
    },
    
    // Layer management for undo/redo
    addFinalStroke: (stroke) => {
        globalHistory.push(stroke);
        // --- THE FIX ---
        // "Bake" the final stroke onto the in-memory static canvas
        CanvasManager.drawStroke(staticCtx, stroke);
    },
    
    applyUndoRedo: (type, data) => {
        if (type === 'undo') {
            const strokeId = data;
            const index = globalHistory.findIndex(s => s.id === strokeId);
            if (index !== -1) {
                globalHistory.splice(index, 1);
            }
        } else if (type === 'redo') {
            const redoneStroke = data;
            globalHistory.push(redoneStroke);
        }
        
        // --- THE FIX ---
        // We must rebuild the *entire* static canvas from history
        rebuildStaticCanvas(); 
        CanvasManager.fullRedraw();
    },
    
    handleRemoteCursorMove: (cursorData) => {
        if (WebSocketClient.getCurrentUser().id === cursorData.userId) return;
        remoteCursors[cursorData.userId] = { x: cursorData.x, y: cursorData.y };
        CanvasManager.fullRedraw(); // Redraw to update cursor position
    },
    
    // --- Public Getters/Setters ---
    
    setTool: (tool) => { currentTool = tool; },
    setColor: (color) => { currentColor = color; },
    setWidth: (width) => { currentWidth = width; },
    getHistory: () => globalHistory,
    setHistory: (history) => { 
        globalHistory.length = 0; 
        globalHistory.push(...history);
        
        // --- THE FIX ---
        // Build the static canvas from the initial history
        rebuildStaticCanvas();
        CanvasManager.fullRedraw();
    }
};