const socket = io({ timeout: 5000 });

const playBtn = document.getElementById("playBtn");
const playStatus = document.getElementById("playStatus");
const gameList = document.getElementById("gameList");

const setPlayState = (label, message, disabled = true) => {
  playBtn.textContent = label;
  playBtn.disabled = disabled;
  playStatus.textContent = message;
};

socket.on("connect", () => {
  setPlayState("Play a Game", "Ready to find an opponent.", false);
});

socket.on("connect_error", () => {
  setPlayState(
    "Reconnecting...",
    "Unable to connect to the server. Retrying..."
  );
});

socket.on("disconnect", () => {
  setPlayState(
    "Reconnecting...",
    "Connection lost. Reconnecting to the server..."
  );
});

playBtn.addEventListener("click", () => {
  if (!socket.connected || playBtn.disabled) return;

  setPlayState(
    "Finding Opponent...",
    "Looking for another player to join."
  );
  socket.emit("playOnline");
});

socket.on("waiting", () => {
  setPlayState(
    "Waiting for Opponent...",
    "Your game will start when another player joins."
  );
});

socket.on("redirectToGame", ({ gameId, token }) => {
  window.location.href = `/game/${gameId}?token=${token}`;
});

socket.on("updateGameList", (games) => {
  gameList.innerHTML = "";
  if (games.length === 0) {
    gameList.innerHTML =
      '<p class="no-games">No games currently in progress. Start one!</p>';
  } else {
    games.forEach((game) => {
      const gameElement = document.createElement("a");
      gameElement.href = `/game/${game.id}`;
      gameElement.classList.add("game-item");
      gameElement.innerHTML = `
        <div class="game-item-players">
            <span class="player-name">${game.white}</span>
            <span class="vs-text">vs</span>
            <span class="player-name">${game.black}</span>
        </div>
        <div class="game-item-info">
            <span>${game.viewerCount} watching</span>
        </div>
      `;
      gameList.appendChild(gameElement);
    });
  }
});
