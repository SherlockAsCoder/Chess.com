import express from "express";
import { Server, Socket } from "socket.io";
import http from "http";
import { Chess } from "chess.js";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

interface Player {
  id: string | null;
  username: string;
  token?: string;
}

interface GameState {
  chess: any;
  players: {
    white: Player | null;
    black: Player | null;
  };
  spectators: string[];
  status: "waiting" | "playing" | "ended";
  result?: string;
}

const games: Record<string, GameState> = {};
let waitingPlayerSocketId: string | null = null;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  const ongoingGames = Object.entries(games)
    .filter(([_, game]) => game.status === "playing")
    .map(([id, game]) => ({
      id,
      white: game.players.white?.username || "Player 1",
      black: game.players.black?.username || "Player 2",
      viewerCount: game.spectators.length,
    }));

  res.render("home", {
    title: "Chess Online",
    games: ongoingGames,
  });
});

app.get("/game/:gameId", (req, res) => {
  const gameId = req.params.gameId;
  if (games[gameId]) {
    res.render("game", {
      title: "Chess Game",
      gameId: gameId,
    });
  } else {
    res.status(404).send("Game not found. <a href='/'>Go Home</a>");
  }
});

const updateGameLists = () => {
  const ongoingGames = Object.entries(games)
    .filter(
      ([_, game]) =>
        game.status === "playing" && game.players.white && game.players.black
    )
    .map(([id, game]) => ({
      id,
      white: game.players.white?.username || "Player 1",
      black: game.players.black?.username || "Player 2",
      viewerCount: game.spectators.length,
    }));
  io.emit("updateGameList", ongoingGames);
};

io.on("connection", (socket: Socket) => {
  console.log("Connected socket id:", socket.id);

  socket.on("playOnline", () => {
    if (waitingPlayerSocketId && waitingPlayerSocketId !== socket.id) {
      const player1Socket = io.sockets.sockets.get(waitingPlayerSocketId);
      waitingPlayerSocketId = null;

      if (player1Socket) {
        const gameId = randomUUID();
        const whiteToken = randomUUID();
        const blackToken = randomUUID();

        games[gameId] = {
          chess: new Chess(),
          players: {
            white: { id: null, username: "Player 1", token: whiteToken },
            black: { id: null, username: "Player 2", token: blackToken },
          },
          spectators: [],
          status: "playing",
        };

        player1Socket.emit("redirectToGame", { gameId, token: whiteToken });
        socket.emit("redirectToGame", { gameId, token: blackToken });
        console.log(
          `Matched ${player1Socket.id} (White) and ${socket.id} (Black) in game ${gameId}`
        );
        updateGameLists();
      } else {
        waitingPlayerSocketId = socket.id;
        socket.emit("waiting");
      }
    } else {
      waitingPlayerSocketId = socket.id;
      socket.emit("waiting");
      console.log(`Player ${socket.id} is waiting for an opponent.`);
    }
  });

  socket.on(
    "playerJoinsGame",
    (data: { gameId: string; playerToken?: string }) => {
      const { gameId, playerToken } = data;

      if (!games[gameId]) {
        return socket.emit("error", "Game not found");
      }
      const game = games[gameId];
      socket.join(gameId);
      (socket as any).gameId = gameId;

      if (playerToken && game.players.white?.token === playerToken) {
        game.players.white.id = socket.id;
        socket.emit("playerRole", "w");
        console.log(`Player ${socket.id} confirmed as WHITE in game ${gameId}`);
      } else if (playerToken && game.players.black?.token === playerToken) {
        game.players.black.id = socket.id;
        socket.emit("playerRole", "b");
        console.log(`Player ${socket.id} confirmed as BLACK in game ${gameId}`);
      } else {
        game.spectators.push(socket.id);
        socket.emit("spectatorRole");
        console.log(
          `Socket ${socket.id} joined game ${gameId} as a spectator.`
        );
      }

      io.to(gameId).emit("updatePlayers", {
        white: game.players.white
          ? { username: game.players.white.username }
          : null,
        black: game.players.black
          ? { username: game.players.black.username }
          : null,
      });
      io.to(gameId).emit("viewerCount", game.spectators.length);
      socket.emit("boardState", game.chess.fen());

      if (game.players.white?.id && game.players.black?.id) {
        io.to(gameId).emit("gameStart");
      }
    }
  );

  socket.on(
    "move",
    (move: { from: string; to: string; promotion?: string }) => {
      const gameId = (socket as any).gameId;
      if (!gameId || !games[gameId]) return;

      const game = games[gameId];
      if (game.status !== "playing") return;

      const currentPlayer =
        game.chess.turn() === "w" ? game.players.white : game.players.black;
      if (socket.id !== currentPlayer?.id) {
        return;
      }

      try {
        if (game.chess.move(move)) {
          io.to(gameId).emit("move", move);
          io.to(gameId).emit("boardState", game.chess.fen());

          if (game.chess.isGameOver()) {
            let resultMessage = "Game Over";
            if (game.chess.isCheckmate()) {
              resultMessage = `Checkmate! ${
                game.chess.turn() === "w" ? "Black" : "White"
              } wins.`;
            } else if (game.chess.isDraw()) {
              resultMessage = "Draw!";
            }
            game.status = "ended";
            game.result = resultMessage;
            io.to(gameId).emit("gameOver", { result: resultMessage });

            setTimeout(() => {
              delete games[gameId];
              updateGameLists();
            }, 30000);
          }
        }
      } catch (err) {
        console.error("Error on move:", err);
      }
    }
  );

  socket.on("disconnect", () => {
    console.log("Disconnected socket id:", socket.id);

    if (waitingPlayerSocketId === socket.id) {
      waitingPlayerSocketId = null;
      console.log("Waiting player disconnected.");
    }

    const gameId = (socket as any).gameId;
    if (!gameId || !games[gameId]) return;

    const game = games[gameId];
    const isWhitePlayer = socket.id === game.players.white?.id;
    const isBlackPlayer = socket.id === game.players.black?.id;

    if (isWhitePlayer || isBlackPlayer) {
      if (game.status !== "ended") {
        game.status = "ended";
        game.result = isWhitePlayer
          ? "Black wins by disconnect."
          : "White wins by disconnect.";
        io.to(gameId).emit("gameOver", { result: game.result });
        console.log(`Game ${gameId} ended due to disconnect.`);
        setTimeout(() => {
          delete games[gameId];
          updateGameLists();
        }, 10000);
      }
    } else {
      game.spectators = game.spectators.filter((id) => id !== socket.id);
      io.to(gameId).emit("viewerCount", game.spectators.length);
    }
    updateGameLists();
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
