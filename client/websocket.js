// collaborative-canvas/client/websocket.js

// Declare socket globally to be accessible by other modules
const socket = io(); 
let currentUser = null;

const WebSocketClient = {
    init: (onInit, onRemoteDrawing, onStrokeFinalized, onUndoRedo, onUserUpdate, onRemoteCursorMove) => {
        socket.on('init', (data) => {
            currentUser = data.currentUser;
            console.log("Initialized with user:", currentUser);
            onInit(data);
        });

        socket.on('remote_drawing', onRemoteDrawing);
        socket.on('stroke_finalized', onStrokeFinalized);
        socket.on('user_list_update', onUserUpdate);
        socket.on('remote_cursor_move', onRemoteCursorMove);
        
        // State Synchronization listeners
        socket.on('undo_broadcast', (strokeId) => onUndoRedo('undo', strokeId));
        socket.on('redo_broadcast', (stroke) => onUndoRedo('redo', stroke));
    },

    // Event streaming strategy: Send high-frequency points
    sendDrawingData: (point) => {
        socket.emit('drawing_data', point);
    },

    // Batched vs. individual stroke events: Send final stroke object
    sendStrokeComplete: (strokeData) => {
        socket.emit('stroke_complete', {
            ...strokeData,
            userId: currentUser.id
        });
    },
    
    // Global Undo/Redo
    sendUndo: () => {
        socket.emit('undo');
    },
    
    sendRedo: () => {
        socket.emit('redo');
    },
    
    // User Indicators (Cursor tracking)
    sendCursorMove: (position) => {
        socket.emit('cursor_move', position);
    },
    
    getCurrentUser: () => currentUser
};