//npm run dev

import express from 'express';
import type { Request, Response } from 'express';
import cors from "cors";
import { addUser, getState, findUser, removeUser, setEstimation, resetAllEstimations, setVisibility } from './routes/users.ts'
import { WebSocketServer, WebSocket } from 'ws';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { styleText } from 'util';
import type { Socket } from 'net';

const app = express();
app.use(express.json());
app.use(cors());

//POST route for user signup
app.post('/api/signup', (req: Request, res: Response) => {
  const {name} = req.body;

  //Check that name exists, and is of type string
  if(!name || typeof name !== 'string'){
    return res.status(400).json({errors: [{message: 'Name is Required'}]});
  }

  const user = addUser(name);

  res.json({data: {id: user.id, name: user.name}});
  console.log(`${user.name} joined the room` );
  broadcastState();
});

//POST route for setting user estimation
app.post('/api/estimation', (req: Request, res: Response) => {
  const { userId, estimation } = req.body;

  //Checks that userId exists, and is of type string
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ errors: [{ message: 'userId is required' }] });
  }

  if (estimation !== null && typeof estimation !== 'string') {
    return res.status(400).json({ errors: [{ message: 'estimation must be a string or null' }] });
  }

  const user = setEstimation(userId, estimation);

  //The user is gone, most likely because the server restarted since they joined.
  //The client turns this into a prompt to rejoin rather than swallowing it.
  if (!user){
    return res.status(404).json({ errors: [{ message: 'User not found'}] });
  }

  res.json({ data: { id: user.id, name: user.name, estimation: user.estimation}});
  console.log(`${user.name} voted ${user.estimation}`);
  broadcastState();
})

//POST route for resetting all estimations
app.post('/api/resetEstimation', (req: Request, res: Response ) => {
  resetAllEstimations();
  res.json({ data: getState() });
  console.log(`Estimations Reset`);
  broadcastState();
});

//POST route for showing or hiding estimations
app.post('/api/visibility', (req: Request, res: Response) => {
  const { visible } = req.body;

  if (typeof visible !== 'boolean') {
    return res.status(400).json({ errors: [{ message: 'visible must be true or false' }] });
  }

  res.json({ data: { visible: setVisibility(visible) }});
  console.log(`Visibility toggled: ${visible}`);
  broadcastState();
})

const server = app.listen(3000, () => {
  console.log(`Server running on ${styleText(["blue", "bold", "underline"], 'http://localhost:3000')}`);
});

//The path our own clients connect on. Vite's dev server also opens a websocket
//for hot reload, and because the page is served through the proxy below, Vite
//aims that socket at this port too. Accepting every upgrade meant we adopted the
//hot-reload socket as if it were a participant, which is why one browser tab
//logged two connections.
export const WS_PATH = '/ws';

//noServer so we can route upgrades ourselves rather than claiming all of them
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (pathname === WS_PATH) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    return;
  }

  //Anything else belongs to the frontend dev server, hot reload included.
  //The upgrade event always hands us a net.Socket, it is just typed as a Duplex.
  frontendProxy.upgrade(req, socket as Socket, head);
});

//Which user, if any, each open connection belongs to. Clients announce
//themselves with an IDENTIFY message once they know their own id.
const clients: Map<WebSocket, { userId: string | null; isAlive: boolean }> = new Map();

//The ingress closes idle connections after 60 seconds, so keep traffic flowing.
//This doubles as liveness detection: a socket that misses a pong is dropped,
//which is what stops half-dead connections from lingering in the client map.
const HEARTBEAT_MS = 30_000;

//A refresh briefly looks identical to leaving, so wait before removing someone.
const DISCONNECT_GRACE_MS = 10_000;
const pendingRemovals: Map<string, NodeJS.Timeout> = new Map();

wss.on('connection', (ws) => {
  console.log("A client connected via WebSocket");
  clients.set(ws, { userId: null, isAlive: true });

  //Send the current board immediately so a new or reconnecting tab is correct
  //without having to wait for somebody else to do something.
  send(ws, { type: 'STATE', state: getState() });

  ws.on('pong', () => {
    const info = clients.get(ws);
    if (info) info.isAlive = true;
  });

  ws.on('message', (raw) => {
    let message: { type?: string; userId?: unknown };

    try {
      message = JSON.parse(raw.toString());
    }
    catch {
      console.error("Ignoring unparseable client message");
      return;
    }

    if (message.type !== 'IDENTIFY' || typeof message.userId !== 'string') return;

    const info = clients.get(ws);
    if (!info) return;

    //A stored id from before a restart no longer exists, so tell the client to
    //rejoin rather than leaving it sitting on a board it can't vote on.
    if (!findUser(message.userId)) {
      send(ws, { type: 'UNKNOWN_USER' });
      return;
    }

    info.userId = message.userId;
    cancelPendingRemoval(message.userId);
  });

  ws.on('close', () => {
    console.log("A client disconnected");
    const info = clients.get(ws);
    clients.delete(ws);

    if (info?.userId) {
      schedulePendingRemoval(info.userId);
    }
  });
});

//Drops a user once they have been gone for the grace period. Without this they
//stayed on the board forever with no vote, which blocked reveal for the whole
//room as soon as anyone closed a tab.
function schedulePendingRemoval(userId: string): void {
  if (hasOpenConnection(userId) || pendingRemovals.has(userId)) return;

  const timer = setTimeout(() => {
    pendingRemovals.delete(userId);

    if (hasOpenConnection(userId)) return;

    if (removeUser(userId)) {
      console.log(`Removed user ${userId} after disconnect`);
      broadcastState();
    }
  }, DISCONNECT_GRACE_MS);

  pendingRemovals.set(userId, timer);
}

function cancelPendingRemoval(userId: string): void {
  const timer = pendingRemovals.get(userId);
  if (!timer) return;

  clearTimeout(timer);
  pendingRemovals.delete(userId);
}

//True if this user still has at least one live tab, e.g. a second window
function hasOpenConnection(userId: string): boolean {
  for (const info of clients.values()) {
    if (info.userId === userId) return true;
  }
  return false;
}

const heartbeat = setInterval(() => {
  clients.forEach((info, ws) => {
    //No pong since the last round, so treat the connection as gone
    if (!info.isAlive) {
      console.log("Terminating an unresponsive client");
      ws.terminate();
      return;
    }

    info.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

//Server health check
app.get('/health', (req: Request, res: Response) => {
    res.send('Scrum Poker Backend API is running successfully!');
});

//GET route for the current board, used for the initial page load
app.get('/api/users', (req: Request, res: Response) => {
  res.json({ data: getState() });
});

// Catch-all: forward anything unmatched to another port on the same machine
const frontendProxy = createProxyMiddleware({
  target: 'http://localhost:5173', // the other service's port
  changeOrigin: true,
});

app.use('/', frontendProxy);

//Sends to a single client. A socket that has started closing throws on send, so
//this is guarded, otherwise one dead connection would abort a whole broadcast
//and leave every client after it in the set stuck on old state.
function send(client: WebSocket, message: unknown): void {
  if (client.readyState !== WebSocket.OPEN) return;

  try {
    client.send(JSON.stringify(message));
  }
  catch (error) {
    console.error("Failed to send to a client: ", error);
  }
}

//Pushes the full board to everyone. The state travels with the message so
//clients never have to fetch it themselves and can't race each other.
function broadcastState(): void {
  const message = { type: 'STATE', state: getState() };
  clients.forEach((_info, client) => send(client, message));
}
