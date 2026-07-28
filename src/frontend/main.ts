import { apiPost, apiGet } from "./api.ts";
import { type User, type BoardState } from "../routes/users.ts";

//Tracks which user this browser tab is signed in as
let currentUserId: string | null = null;

//Version of the most recent board we rendered. Snapshots that aren't newer than
//this are dropped, so a slow response arriving late can't roll the UI backwards.
let renderedVersion = -1;

const errorMsg = document.querySelector('.input-group p') as HTMLParagraphElement | null;
const signUpForm = document.getElementById('login-view') as HTMLFormElement | null;
const nameBox = document.getElementById('usernameInput') as HTMLInputElement | null;
const txtDisplayName = document.getElementById('responseDisplay') as HTMLParagraphElement | null;
const deleteEstimatesBtn = document.getElementById('delete-btn') as HTMLButtonElement | null;
const revealBtn = document.getElementById('reveal-btn') as HTMLButtonElement | null;
const tbody = document.getElementById('players-list-body');
const cardButtons = Array.from(
    document.querySelectorAll('.poker-card-btn')
) as HTMLButtonElement[];

//The last board the server sent us, so click handlers can read current state
let board: BoardState | null = null;

//Reconnect delay, doubled on each consecutive failure so a restarting server
//doesn't get hammered by everyone in the call at once.
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;
let reconnectDelay = RECONNECT_MIN_MS;

let socket: WebSocket | null = null;

//Survives a refresh, so reloading rejoins the same seat instead of creating a
//second phantom participant who never votes.
const SESSION_KEY = 'scrum-poker-session';

function saveSession(id: string, name: string): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, name }));
}

function clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
}

function loadSession(): { id: string; name: string } | null {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.id === 'string' && typeof parsed?.name === 'string' ? parsed : null;
    }
    catch {
        return null;
    }
}

function connect(): void {
    //Must match WS_PATH on the server. Connecting at the root would also pick up
    //Vite's hot-reload socket, which shares this host in development.
    socket = new WebSocket(`${window.location.protocol.replace('http','ws')}//${window.location.host}/ws`);

    socket.addEventListener('open', () => {
        console.log("Connected to server via webSocket");
        reconnectDelay = RECONNECT_MIN_MS;

        //A fresh connection means a fresh version sequence. The server restarts
        //its counter at zero, so holding on to the old high-water mark here
        //would make us ignore every update from then on.
        renderedVersion = -1;

        //Tell the server who we are so it knows to keep our seat, and so it can
        //release it when we really do leave.
        if (currentUserId) {
            socket?.send(JSON.stringify({ type: 'IDENTIFY', userId: currentUserId }));
        }

        setStatus("");
    });

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'STATE') {
            applyState(message.state);
        }
        else if (message.type === 'UNKNOWN_USER') {
            //The server no longer has us, almost always because it restarted
            handleSessionLost();
        }
    });

    socket.addEventListener('close', () => {
        //We were disconnected, so we missed every update in the meantime. Say so
        //rather than leaving a frozen board that looks current.
        setStatus("Reconnecting...");

        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    });

    socket.addEventListener('error', () => socket?.close());
}

//Sends us back to the join screen when our seat no longer exists
function handleSessionLost(): void {
    clearSession();
    currentUserId = null;
    board = null;
    renderedVersion = -1;

    document.getElementById('game-view')?.classList.add('hidden');
    document.getElementById('login-view')?.classList.remove('hidden');
    showSignUpError("The session restarted. Please rejoin.");
}

signUpForm?.addEventListener('submit', sendSignUp);
deleteEstimatesBtn?.addEventListener('click', deleteEstimates);
revealBtn?.addEventListener('click', toggleVisibility);
cardButtons.forEach(button => {
    button.addEventListener('click', () => selectCard(button.dataset.value ?? ''));
});

//Accepts a board snapshot if it is newer than what is on screen
function applyState(state: BoardState): void {
    if (state.version <= renderedVersion) {
        console.log(`Ignoring stale state v${state.version}, already at v${renderedVersion}`);
        return;
    }

    renderedVersion = state.version;
    board = state;
    render(state);
}

//Displays a validation error message
function showSignUpError(message: string): void {
    if (errorMsg && nameBox) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        nameBox.style.borderColor = '#ef4444';
    }
}

//validate the entered name
function validateNameSignUp(name: string): string | null {
    if (name === '') return "A name must be entered";
    if (name.length < 2) return "Name must be atleast 2 characters long";
    if (name.length > 50) return "Name cannot be longer than 50 characters";
    return null;
}

//Switches the screen from the signup form to the main page
function navigateToGameView(name: string): void {
    document.getElementById('login-view')?.classList.add('hidden');
    document.getElementById('game-view')?.classList.remove('hidden');

    const currentPlayerLabel = document.getElementById('current-player-name');
    if (currentPlayerLabel) {
        currentPlayerLabel.innerText = name;
    }
}

//Runs when the signup form is submitted
async function sendSignUp(e: SubmitEvent) {
    e.preventDefault();

    if (!nameBox) {
        console.error("Could not find usernameInput element");
        return;
    }

    //Reset any leftover error styling from a previous failed attempt.
    if (errorMsg) {
        errorMsg.style.display = 'none';
        nameBox.style.borderColor = '#cbd5e1';
    }

    const enteredName = nameBox.value.trim();
    const validationError = validateNameSignUp(enteredName); //validates entered name

    //if true display error text
    if (validationError) {
        showSignUpError(validationError);
        nameBox.value = '';
        return;
    }

    try {
        const data = await apiPost<User>('/api/signup', { name: enteredName });

        currentUserId = data?.id ?? null;

        if (currentUserId) {
            saveSession(currentUserId, enteredName);
            socket?.send(JSON.stringify({ type: 'IDENTIFY', userId: currentUserId }));
        }

        navigateToGameView(enteredName);
        await refreshBoard();
    }
    catch (error) {
        console.error("Sign up failed:", error);
        showSignUpError("Could not join the room. Please try again.");
    }
}

//when user starts to type again, reset ui to default
nameBox?.addEventListener('input', () => {
    if (errorMsg) errorMsg.style.display = 'none';
    if (nameBox) nameBox.style.borderColor = '#cbd5e1';
});

//when user selects a card on screen
async function selectCard(value: string) {
    if (!currentUserId) {
        console.error("Cannot submit estimate, no user signed in");
        return;
    }

    try {
        await apiPost<User>('/api/estimation', {
            userId: currentUserId,
            estimation: value
        });
        //No local highlighting here, the card comes back selected via the
        //broadcast, which keeps what we show identical to what the server holds.
    }
    catch (error) {
        console.error("Estimate submission failed: ", error);

        //Our seat is gone, so silently dropping the vote would leave the room
        //waiting on someone who can no longer vote.
        handleSessionLost();
    }
}

//when any user clicks delete estimates
async function deleteEstimates() {
    try {
        await apiPost('/api/resetEstimation', {});
    }
    catch (error) {
        console.error("Reset Failed: ", error);
    }
}

//Asks for the opposite of whatever the server last told us, by explicit value
async function toggleVisibility() {
    const wantVisible = !(board?.visible ?? false);

    if (wantVisible && !allUsersHaveVoted(board?.users ?? [])) {
        setStatus("Everyone needs to vote before revealing");
        return;
    }

    try {
        await apiPost<{ visible: boolean }>('/api/visibility', { visible: wantVisible });
        setStatus("");
    }
    catch (error) {
        console.error("Toggle failed: ", error);
        setStatus(error instanceof Error ? error.message : "Could not change visibility");
    }
}

//Pulls the board over HTTP, used on the initial load
async function refreshBoard() {
    try {
        applyState(await apiGet<BoardState>('/api/users'));
    }
    catch (error) {
        console.error("Failed to refresh board: ", error);
    }
}

function allUsersHaveVoted(users: User[]): boolean {
    return users.length > 0 && users.every(user => user.estimation !== null);
}

function setStatus(message: string): void {
    if (txtDisplayName) {
        txtDisplayName.innerText = message;
    }
}

//Paints the whole UI from one snapshot
function render(state: BoardState) {
    renderCards(state.users);
    renderRevealButton(state.users, state.visible);
    createRows(state.users, state.visible);
}

//Highlights whichever card matches our own vote on the server. Deriving this
//from state rather than from the click means a reset clears it everywhere,
//including on tabs that were disconnected when the reset happened.
function renderCards(users: User[]) {
    const me = users.find(u => u.id === currentUserId);

    cardButtons.forEach(button => {
        button.classList.toggle('selected', !!me && button.dataset.value === me.estimation);
    });
}

function renderRevealButton(users: User[], visible: boolean) {
    if (!revealBtn) return;

    revealBtn.innerHTML = visible ? 'Hide' : 'Show';

    //Red outline while the room still can't be revealed
    revealBtn.style.borderColor = visible || allUsersHaveVoted(users) ? '' : '#ef4444';
}

//Restores a refreshed tab into its existing seat, then opens the connection.
//The server holds a seat for a short grace period after a socket drops, so a
//reload lands back on the same user rather than adding a duplicate.
function start(): void {
    const session = loadSession();

    if (session) {
        currentUserId = session.id;
        navigateToGameView(session.name);
    }

    connect();
}

start();

function createRows(users: User[], visible: boolean) {
    //clear all users visually
    if(!tbody) return;

    tbody.innerHTML = '';

    //creates new row for each additional user
    users.forEach(user => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = user.name;

        //makes your name visually different from others
        if (user.id === currentUserId) {
            nameCell.classList.add('current-user');
        }

        const voteCell = document.createElement('td');
        voteCell.style.textAlign = 'right';

        const badge = document.createElement('span');
        badge.classList.add('vote-badge');

        //Three possible states for each user's badge:
        if (user.estimation === null) {
            //Hasn't voted yet at all.
            badge.textContent = '-';
        }
        else if (visible) {
            //Has voted, and estimates are currently revealed, show the real value.
            badge.textContent = user.estimation;
        }
        else {
            //Has voted, but estimates are hidden — show a placeholder instead
            badge.textContent = '?';
        }
        voteCell.appendChild(badge);
        row.appendChild(nameCell);
        row.appendChild(voteCell);
        tbody.appendChild(row);
    });
}
