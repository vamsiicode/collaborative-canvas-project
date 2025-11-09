// collaborative-canvas/client/main.js

let users = [];

const mainApp = {
    init: () => {
        // Initialize Canvas
        CanvasManager.init('drawing-canvas');
        
        // Initialize WebSocket Client
        WebSocketClient.init(
            mainApp.handleInit,
            CanvasManager.handleRemoteDrawing,
            CanvasManager.handleStrokeFinalized,
            CanvasManager.applyUndoRedo,
            mainApp.handleUserListUpdate,
            CanvasManager.handleRemoteCursorMove
        );
        
        // Set up UI event listeners
        mainApp.setupUIListeners();
    },
    
    handleInit: (data) => {
        // Load initial history for state consistency
        CanvasManager.setHistory(data.history);
        CanvasManager.fullRedraw();
        
        // Update user list
        mainApp.handleUserListUpdate(data.users);
        
        // Display current user info
        const user = data.currentUser;
        document.getElementById('user-info').textContent = 
            `You are: ${user.username} (Color: ${user.color})`;
    },
    
    setupUIListeners: () => {
        // Tool selection
        document.getElementById('tool-brush').addEventListener('click', () => {
            CanvasManager.setTool('brush');
            mainApp.updateToolButtons('tool-brush');
        });
        document.getElementById('tool-eraser').addEventListener('click', () => {
            CanvasManager.setTool('eraser');
            mainApp.updateToolButtons('tool-eraser');
        });
        
        // Color and width
        document.getElementById('color-picker').addEventListener('input', (e) => {
            CanvasManager.setColor(e.target.value);
        });
        document.getElementById('stroke-width').addEventListener('input', (e) => {
            CanvasManager.setWidth(parseInt(e.target.value, 10));
        });
        
        // Undo/Redo
        document.getElementById('undo-btn').addEventListener('click', WebSocketClient.sendUndo);
        document.getElementById('redo-btn').addEventListener('click', WebSocketClient.sendRedo);
        
        // Keyboard shortcuts for quick access
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                WebSocketClient.sendUndo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                WebSocketClient.sendRedo();
            }
        });
    },

    updateToolButtons: (activeId) => {
        document.querySelectorAll('#toolbar button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(activeId).classList.add('active');
    },

    handleUserListUpdate: (updatedUsers) => {
        users = updatedUsers;
        const container = document.getElementById('users-container');
        container.innerHTML = '';
        
        users.forEach(user => {
            const li = document.createElement('li');
            li.innerHTML = `<span style="color: ${user.color};">•</span> ${user.username}`;
            container.appendChild(li);
        });
    },
    
    getUserById: (userId) => {
        return users.find(u => u.id === userId);
    }
};

// Start the application
document.addEventListener('DOMContentLoaded', mainApp.init);