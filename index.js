const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

let lobbies = {};

io.on("connection", (socket) => {
  console.log("Připojen:", socket.id);

  socket.on("createLobby", ({ playerName }) => {
    const lobbyId = Math.random().toString(36).substr(2, 6).toUpperCase();
    lobbies[lobbyId] = { players: [{ id: socket.id, name: playerName }] };
    socket.join(lobbyId);
    socket.emit("lobbyCreated", { lobbyId });
    console.log("Lobby vytvořena:", lobbyId);
  });

  socket.on("joinLobby", ({ lobbyId, playerName }) => {
    const lobby = lobbies[lobbyId];
    if (lobby) {
      lobby.players.push({ id: socket.id, name: playerName });
      socket.join(lobbyId);
      io.to(lobbyId).emit("lobbyUpdate", lobby.players);
    } else {
      socket.emit("errorMessage", "Lobby neexistuje");
    }
  });

  socket.on("sendMessage", ({ lobbyId, message }) => {
    io.to(lobbyId).emit("newMessage", message);
  });

  socket.on("disconnect", () => {
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      lobby.players = lobby.players.filter((p) => p.id !== socket.id);
      if (lobby.players.length === 0) {
        delete lobbies[lobbyId];
      } else {
        io.to(lobbyId).emit("lobbyUpdate", lobby.players);
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("Server běží!");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
