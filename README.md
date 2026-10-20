# Kitnet 47

Escape game point-and-click multiplayer, mobile first, com partidas de até 3 minutos. Os jogadores entram na mesma sala, se veem pelo cenário e conversam para resolver juntos as histórias da kitnet.

## Rodar

```bash
node server.js             # http://localhost:8047
PORT=9000 node server.js   # outra porta
```

`server.js` usa só o Node, sem dependências. O jogo é o `kitnet.html`; `public/` tem a página publicada e `data/rooms.json` guarda as salas.
