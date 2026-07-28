//npm run dev

import express from 'express';
import type { Request, Response } from 'express';
import cors from "cors";
import { addUser, getState, setEstimation, resetAllEstimations, setVisibility, allUsersHaveVoted } from './routes/users.ts'
import { WebSocketServer, WebSocket } from 'ws';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { styleText } from 'util';

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

  broadcastState();
})

//POST route for resetting all estimations
app.post('/api/resetEstimation', (req: Request, res: Response ) => {
  resetAllEstimations();
  res.json({ data: getState() });

  broadcastState();
});

//POST route for showing or hiding estimations
app.post('/api/visibility', (req: Request, res: Response) => {
  const { visible } = req.body;

  if (typeof visible !== 'boolean') {
    return res.status(400).json({ errors: [{ message: 'visible must be true or false' }] });
  }

  //Enforced here as well as in the UI, since two people revealing at the same
  //moment can both pass the client-side check before either request lands.
  if (visible && !allUsersHaveVoted()) {
    return res.status(409).json({ errors: [{ message: 'Everyone must vote before revealing' }] });
  }

  res.json({ data: { visible: setVisibility(visible) }});

  broadcastState();
})

const server = app.listen(3000, () => {
  console.log(`Server running on ${styleText(["blue", "bold", "underline"], 'http://localhost:3000')}`);
});

const wss = new WebSocketServer({server});
const clients: Set<WebSocket> = new Set(); //Use set as clients are always unique

wss.on('connection', (ws) => {
  console.log("A client connected via WebSocket");
  clients.add(ws);

  //Send the current board immediately so a new or reconnecting tab is correct
  //without having to wait for somebody else to do something.
  send(ws, { type: 'STATE', state: getState() });

  ws.on('close', () => {
    console.log("A client disconnected");
    clients.delete(ws);
  });
});

//Server health check
app.get('/health', (req: Request, res: Response) => {
    res.send('Scrum Poker Backend API is running successfully!');
});

//GET route for the current board, used for the initial page load
app.get('/api/users', (req: Request, res: Response) => {
  res.json({ data: getState() });
});

// Catch-all: forward anything unmatched to another port on the same machine
app.use(
  '/',
  createProxyMiddleware({
    target: 'http://localhost:5173', // the other service's port
    changeOrigin: true,
  })
);

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
  clients.forEach(client => send(client, message));
}
