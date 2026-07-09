//npm run dev

import express from 'express';
import type { Request, Response } from 'express';
import cors from "cors";
import { addUser, getAllUsers, findUser, resetAllEstimations, getVisibility, toggleVisibility } from './routes/users.ts'
import { WebSocketServer, type WebSocket } from 'ws';

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

  broadcast({ type: 'USER_JOINED'});
});

//POST route for setting user estimation
app.post('/api/estimation', (req: Request, res: Response) => {
  const { userId, estimation } = req.body;

  //Checks that userId exists, and is of type string
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ errors: [{ message: 'userId is required' }] });
  }

  const user = findUser(userId);
  
  //Checks that a user was found
  if (!user){
    return res.status(404).json({ errors: [{ message: 'User not found'}] });
  }

  user.estimation = estimation;
  console.log("User after update: ", user);
  res.json({ data: { id: user.id, name: user.name, estimation: user.estimation}});

  broadcast({ type: 'ESTIMATION_UPDATED'});
})

//POST route for resetting all estimations
app.post('/api/resetEstimation', (req: Request, res: Response ) => {
  resetAllEstimations();
  console.log("All estimations reset. Current users: ", getAllUsers());
  res.json({ data: { message: 'All estimations have been reset' } });

  broadcast({ type: 'RESET'});
});

//POST route for toggling the visibility for estimations
app.post('/api/toggleVisibility', (req: Request, res: Response) => {
  const visible = toggleVisibility();
  console.log("Visibility: ", visible);
  res.json({ data: { visible }});

  broadcast({ type: 'VISIBILITY_UPDATED'});
})

//Server health check
const server = app.listen(3000, () => {
  console.log("Server running on port 3000");
});

const wss = new WebSocketServer({server});
const clients: Set<WebSocket> = new Set(); //Use set as clients are always unique

wss.on('connection', (ws) => {
  console.log("A client connected via WebSocket");
  clients.add(ws);

  ws.on('close', () => {
    console.log("A client disconnected");
    clients.delete(ws);
  });
});

//Server health check
app.get('/', (req: Request, res: Response) => {
    res.send('Scrum Poker Backend API is running successfully!');
});

//GET route to get all users, and check state of visibility
app.get('/api/users', (req: Request, res: Response) => {
  res.json({
    data: {
      users: getAllUsers(),
      visible: getVisibility()
    }
  });
});

//Broadcasts changes to all connected clients
function broadcast(message: unknown) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    client.send(data);
  });
}