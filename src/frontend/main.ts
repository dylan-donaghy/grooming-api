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

const socket = new WebSocket(`${window.location.protocol.replace('http','ws')}//${window.location.host}`);

socket.addEventListener('open', () => {
    console.log("Connected to server via webSocket");
});

socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'STATE') {
        applyState(message.state);
    }
});

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
        setStatus("Your vote didn't save. Please reload and rejoin.");
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
