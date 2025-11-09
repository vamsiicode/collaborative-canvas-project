// collaborative-canvas/server/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const DrawingState = require('./drawing-state');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
// Use Socket.io as required for WebSockets
// This is your NEW, more robust line
const io = new Server(server, {
    // We add a longer "ping" timeout.
    // This tells the server to wait up to 60 seconds for a
    // "pong" response from the client before giving up.
    // This is more than enough for Render's free tier.
    pingTimeout: 60000, 
});

const PORT = process.env.PORT || 3000;
const ROOM_NAME = 'default_room';

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '..', 'client')));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // 1. User Management & Initialization
    const username = `User_${Math.floor(Math.random() * 1000)}`; 
    const newUser = RoomManager.addUser(socket.id, username);
    socket.join(ROOM_NAME);

    // Send initial history and user info to the new client
    socket.emit('init', {
        history: DrawingState.getHistory(),
        users: RoomManager.getUsersInRoom(ROOM_NAME),
        currentUser: newUser
    });
    
    // Broadcast user list update
    io.to(ROOM_NAME).emit('user_list_update', RoomManager.getUsersInRoom(ROOM_NAME));
    
    // 2. Real-time Drawing Events
    
    // Handling high-frequency mouse events for real-time sync
    socket.on('drawing_data', (data) => {
        // Broadcast the drawing data to all others in the room
        socket.to(ROOM_NAME).emit('remote_drawing', data);
    });

    // 3. Batched Stroke Completion
    socket.on('stroke_complete', (strokeData) => {
        const fullStroke = DrawingState.addStroke(strokeData);
        // Persist the full stroke and broadcast it as a finalized action
        socket.to(ROOM_NAME).emit('stroke_finalized', fullStroke); 
    });

    // 4. State Synchronization / Global Undo/Redo
    socket.on('undo', () => {
        const undoneStroke = DrawingState.undoLastAction(socket.id);
        if (undoneStroke) {
            // Broadcast the undo action to all clients
            io.to(ROOM_NAME).emit('undo_broadcast', undoneStroke.id); 
        }
    });
    
    socket.on('redo', () => {
        const redoneStroke = DrawingState.redoLastAction(socket.id);
        if (redoneStroke) {
            // Broadcast the redo action to all clients, sending the redone stroke data
            io.to(ROOM_NAME).emit('redo_broadcast', redoneStroke); 
        }
    });
    
    // 5. User Cursor Tracking
    socket.on('cursor_move', (position) => {
        // Broadcast cursor position for User Indicators
        socket.to(ROOM_NAME).emit('remote_cursor_move', { 
            userId: socket.id, 
            ...position 
        });
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        RoomManager.removeUser(socket.id);
        // Broadcast updated user list
        io.to(ROOM_NAME).emit('user_list_update', RoomManager.getUsersInRoom(ROOM_NAME));
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});