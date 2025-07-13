const socket = io();

const playBtn = document.getElementById("playBtn");
const gameList = document.getElementById("gameList");

playBtn.addEventListener("click", () => {
  playBtn.disabled = true;
  socket.emit("playOnline");
});

socket.on("waiting", () => {
  playBtn.textContent = "Waiting for Opponent...";
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
