const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = {};

function generateDeck() {
  const colors = ['red', 'yellow', 'blue', 'green'];
  const deck = [];
  for (let color of colors) {
    for (let i = 1; i <= 12; i++) {
      deck.push({ color, value: i });
      deck.push({ color, value: i });
    }
  }
  for (let i = 0; i < 8; i++) deck.push({ color: 'wild', value: 'wild' });
  for (let i = 0; i < 4; i++) deck.push({ color: 'skip', value: 'skip' });
  return shuffle(deck);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', ({ playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    const deck = generateDeck();
    const players = [{ id: socket.id, name: playerName, hand: [], phase: 1, phaseComplete: false }];
    const game = {
      roomId,
      players,
      deck,
      discard: [],
      currentTurn: 0,
      started: false,
      drewCard: false
    };
    rooms[roomId] = game;
    socket.join(roomId);
    io.to(roomId).emit('roomUpdate', game);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const game = rooms[roomId];
    if (!game || game.started) return;
    game.players.push({ id: socket.id, name: playerName, hand: [], phase: 1, phaseComplete: false });
    socket.join(roomId);
    io.to(roomId).emit('roomUpdate', game);
  });

  socket.on('startGame', ({ roomId }) => {
    const game = rooms[roomId];
    if (!game || game.started) return;
    game.started = true;
    for (let player of game.players) {
      for (let i = 0; i < 10; i++) {
        player.hand.push(game.deck.pop());
      }
    }
    game.discard.push(game.deck.pop());
    io.to(roomId).emit('gameStarted', game);
  });

  socket.on('drawCard', ({ roomId, from }) => {
    const game = rooms[roomId];
    if (!game || !game.started) return;
    const player = game.players[game.currentTurn];
    if (player.id !== socket.id || game.drewCard) return;

    const card = from === 'discard' ? game.discard.pop() : game.deck.pop();
    player.hand.push(card);
    game.drewCard = true;
    io.to(roomId).emit('gameStateUpdate', game);
  });

  socket.on('discardCard', ({ roomId, card }) => {
    const game = rooms[roomId];
    if (!game || !game.started || !game.drewCard) return;
    const player = game.players[game.currentTurn];
    if (player.id !== socket.id) return;

    const index = player.hand.findIndex(c => c.color === card.color && c.value === card.value);
    if (index === -1) return;

    game.discard.push(player.hand.splice(index, 1)[0]);
    game.currentTurn = (game.currentTurn + 1) % game.players.length;
    game.drewCard = false;
    io.to(roomId).emit('gameStateUpdate', game);
  });

  socket.on('chatMessage', ({ roomId, message }) => {
    io.to(roomId).emit('chatMessage', { player: socket.id, message });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      io.to(roomId).emit('roomUpdate', rooms[roomId]);
    }
    console.log('Player disconnected:', socket.id);
  });
});

server.listen(5000, () => {
  console.log('Server is running on port 5000');
});
