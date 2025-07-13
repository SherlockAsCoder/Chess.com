const socket = io();
const chess = new Chess();

const boardElement = document.querySelector("#chessBoard");
const roleIndicator = document.getElementById("role-indicator");
const viewerCountElement = document.getElementById("viewer-count");
const playerLeftInfo = document.getElementById("player-bottom-info");
const playerRightInfo = document.getElementById("player-top-info");
const shareLinkInput = document.getElementById("shareLinkInput");
const copyLinkBtn = document.getElementById("copyLinkBtn");

const promotionModal = document.getElementById("promotion-modal");
const gameOverModal = document.getElementById("game-over-modal");
const gameOverResult = document.getElementById("game-over-result");
const goHomeBtn = document.getElementById("go-home-btn");

const urlParams = new URLSearchParams(window.location.search);
const playerToken = urlParams.get("token");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = "spectator";
let isGameOver = false;
let pendingMove = null;

shareLinkInput.value = window.location.href.split("?")[0];
copyLinkBtn.addEventListener("click", () => {
  shareLinkInput.select();
  navigator.clipboard
    .writeText(shareLinkInput.value)
    .then(() => {
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => {
        copyLinkBtn.textContent = "Copy Link";
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
});

const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";
  board.forEach((row, rowIndex) => {
    row.forEach((square, squareIndex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark"
      );
      squareElement.dataset.row = rowIndex;
      squareElement.dataset.col = squareIndex;

      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );
        pieceElement.innerText = getPieceUnicode(square);
        pieceElement.draggable = playerRole === square.color && !isGameOver;

        if (pieceElement.draggable) {
          pieceElement.addEventListener("dragstart", (e) => {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowIndex, col: squareIndex };
            e.dataTransfer.setData("text/plain", "");
            e.target.classList.add("dragging");
          });
          pieceElement.addEventListener("dragend", (e) => {
            draggedPiece = null;
            sourceSquare = null;
            e.target.classList.remove("dragging");
          });
        }
        squareElement.appendChild(pieceElement);
      }

      squareElement.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      squareElement.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedPiece) {
          const targetSquare = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };
          handleMove(sourceSquare, targetSquare);
        }
      });
      boardElement.appendChild(squareElement);
    });
  });

  if (playerRole === "b") {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }
};

const handleMove = (source, target) => {
  const move = {
    from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
    to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
  };

  const piece = chess.get(move.from);
  if (
    piece &&
    piece.type === "p" &&
    ((piece.color === "w" && target.row === 0) ||
      (piece.color === "b" && target.row === 7))
  ) {
    pendingMove = move;
    promotionModal.style.display = "flex";
  } else {
    socket.emit("move", move);
  }
};

const getPieceUnicode = (piece) => {
  const unicodePieces = { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚" };
  return unicodePieces[piece.type.toLowerCase()] || "";
};

const updateInfoPanel = () => {
  if (isGameOver) return;
  const turn = chess.turn();

  const whitePlayerText =
    playerRole === "w" ? "You (White)" : "Opponent (White)";
  const blackPlayerText =
    playerRole === "b" ? "You (Black)" : "Opponent (Black)";

  if (playerRole === "spectator") {
    roleIndicator.textContent = "You are spectating";
    playerLeftInfo.innerHTML = `White`;
    playerRightInfo.innerHTML = `Black`;
  } else {
    roleIndicator.textContent = "";
    playerLeftInfo.innerHTML = whitePlayerText;
    playerRightInfo.innerHTML = blackPlayerText;
  }

  if (turn === "w") {
    playerLeftInfo.classList.add("active-player");
    playerRightInfo.classList.remove("active-player");
  } else {
    playerRightInfo.classList.add("active-player");
    playerLeftInfo.classList.remove("active-player");
  }
};

socket.on("connect", () => {
  if (gameId) {
    socket.emit("playerJoinsGame", { gameId, playerToken });
  }
});

socket.on("playerRole", (role) => {
  playerRole = role;
  renderBoard();
  updateInfoPanel();
});

socket.on("spectatorRole", () => {
  playerRole = "spectator";
  renderBoard();
  updateInfoPanel();
});

socket.on("boardState", (fen) => {
  chess.load(fen);
  renderBoard();
  updateInfoPanel();
});

socket.on("move", (move) => {
  chess.move(move);
  renderBoard();
  updateInfoPanel();
});

socket.on("invalidMove", ({ move, reason }) => {
  console.log("Invalid move:", move, "Reason:", reason);
});

socket.on("gameStart", () => {
  isGameOver = false;
  renderBoard();
  updateInfoPanel();
});

socket.on("gameOver", ({ result }) => {
  isGameOver = true;
  gameOverResult.textContent = result;
  gameOverModal.style.display = "flex";
  playerLeftInfo.classList.remove("active-player");
  playerRightInfo.classList.remove("active-player");
  renderBoard();
});

socket.on("updatePlayers", (players) => {
  updateInfoPanel();
});

socket.on("viewerCount", (count) => {
  viewerCountElement.textContent = `${count} watching`;
});

socket.on("error", (message) => {
  alert(message);
  window.location.href = "/";
});

promotionModal.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON" && pendingMove) {
    const promotionPiece = e.target.dataset.piece;
    pendingMove.promotion = promotionPiece;
    socket.emit("move", pendingMove);
    pendingMove = null;
    promotionModal.style.display = "none";
  }
});

goHomeBtn.addEventListener("click", () => {
  window.location.href = "/";
});

renderBoard();
updateInfoPanel();
