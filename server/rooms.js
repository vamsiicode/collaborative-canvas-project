// collaborative-canvas/server/rooms.js

// A simple in-memory store for connected users and their room/color.
const activeUsers = {};
const userColors = ['#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#00FFFF', '#FF00FF'];
let colorIndex = 0;

function addUser(socketId, username) {
    const color = userColors[colorIndex % userColors.length];
    colorIndex++;

    activeUsers[socketId] = { 
        id: socketId, 
        username, 
        color,
        // Assume all users are in a single default room for this project
        room: 'default_room' 
    };
    return activeUsers[socketId];
}

function removeUser(socketId) {
    const user = activeUsers[socketId];
    if (user) {
        delete activeUsers[socketId];
    }
    return user;
}

function getUsersInRoom(roomId = 'default_room') {
    return Object.values(activeUsers).filter(user => user.room === roomId);
}

function getUser(socketId) {
    return activeUsers[socketId];
}

module.exports = {
    addUser,
    removeUser,
    getUsersInRoom,
    getUser
};