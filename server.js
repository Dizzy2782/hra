const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Statické soubory
app.use(express.static(path.join(__dirname, 'public')));

// Lobby a stoly
let tables = {};

io.on('connection', (socket) => {
  socket.on('createTable', ({ tableName, nickname }, callback) => {
    if (tables[tableName]) {
      return callback({ error: 'Stůl už existuje.' });
    }
    tables[tableName] = {
      players: [{ id: socket.id, nickname }],
      gameState: null
    };
    socket.join(tableName);
    callback({ success: true });
    io.to(tableName).emit('updatePlayers', tables[tableName].players);
  });

  socket.on('joinTable', ({ tableName, nickname }, callback) => {
    const table = tables[tableName];
    if (!table) {
      return callback({ error: 'Stůl neexistuje.' });
    }
    if (table.players.length >= 8) {
      return callback({ error: 'Stůl je plný.' });
    }
    table.players.push({ id: socket.id, nickname });
    socket.join(tableName);
    callback({ success: true });
    io.to(tableName).emit('updatePlayers', table.players);
  });

  socket.on('startGame', (tableName) => {
    const table = tables[tableName];
    if (!table) return;
    // Základní rozdělení karet (např. 5 karet na hráče, balíček 40 karet)
    const deck = Array.from({ length: 40 }, (_, i) => i + 1);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    table.players.forEach((player, idx) => {
      player.cards = deck.slice(idx * 5, (idx + 1) * 5);
    });
    table.turn = 0;
    table.pot = [];
    table.gameState = 'playing';
    io.to(tableName).emit('gameStarted', {
      players: table.players.map(p => ({ nickname: p.nickname })),
      turn: table.turn
    });
    table.players.forEach((player) => {
      io.to(player.id).emit('yourCards', player.cards);
    });
  });

  socket.on('playCard', ({ tableName, card }, callback) => {
    const table = tables[tableName];
    if (!table || table.gameState !== 'playing') return;
    const playerIdx = table.players.findIndex(p => p.id === socket.id);
    if (playerIdx !== table.turn) return;
    const player = table.players[playerIdx];
    const cardIdx = player.cards.indexOf(card);
    if (cardIdx === -1) return;
    player.cards.splice(cardIdx, 1);
    table.pot.push({ nickname: player.nickname, card });
    // Další hráč na tahu
    table.turn = (table.turn + 1) % table.players.length;
    io.to(tableName).emit('cardPlayed', { nickname: player.nickname, card, pot: table.pot, turn: table.turn });
    io.to(player.id).emit('yourCards', player.cards);
    callback({ success: true });
  });

  socket.on('disconnect', () => {
    for (const [tableName, table] of Object.entries(tables)) {
      const idx = table.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        table.players.splice(idx, 1);
        io.to(tableName).emit('updatePlayers', table.players);
        if (table.players.length === 0) {
          delete tables[tableName];
        }
        break;
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server běží na portu ${PORT}`);
}); 