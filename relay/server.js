// Phase 3: Dumb E2EE Relay Server
// ONLY routes encrypted ciphertexts. Cannot read data.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // roomId -> Set of sockets

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(socket.id);
    socket.to(roomId).emit('peer-joined');
  });

  socket.on('encrypted-delta', (payload) => {
    // payload: { roomId, ciphertext, iv, tag }
    // Broadcast to other clients in room ONLY
    socket.to(payload.roomId).emit('encrypted-delta', payload);
  });

  socket.on('disconnect', () => {
    for (const [roomId, members] of rooms) {
      members.delete(socket.id);
      if (members.size === 0) rooms.delete(roomId);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Dumb relay listening on :${PORT}`);
});
