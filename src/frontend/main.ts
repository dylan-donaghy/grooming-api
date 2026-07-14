import { apiPost, apiGet } from "./api.ts";
import { type User } from "../routes/users.ts";

//Shape of the response returned by GET /api/users
type UsersResponse = {
    users: User[];
    visible: boolean;
};

//Open a persistent WebSocket connection to the server
const socket = new WebSocket('ws://localhost:3000');

//Tracks which user this browser tab is signed in as
let currentUserId: string | null = null;

const errorMsg = document.querySelector('.input-group p') as HTMLParagraphElement | null;
const signUpForm = document.getElementById('login-view') as HTMLFormElement | null;
const nameBox = document.getElementById('usernameInput') as HTMLInputElement | null;
const txtDisplayName = document.getElementById('responseDisplay') as HTMLLabelElement | null;
const deleteEstimatesBtn = document.getElementById('delete-btn') as HTMLButtonElement | null;
const revealBtn = document.getElementById('reveal-btn') as HTMLButtonElement | null;

//Runs once when the WebSocket connection is successfully established.
socket.addEventListener('open', () => {
    console.log("Connected to server via webSocket");
});

socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    console.log("Message received from server: ", message);

    //if estimations being reset, remove highlighting on previously selected card
    if (message.type === 'RESET') {
        const allCards = document.querySelectorAll('.poker-card-btn');
        allCards.forEach(card => card.classList.remove('selected'));
    }
    refreshUserList();
});

signUpForm?.addEventListener('submit', sendSignUp);
deleteEstimatesBtn?.addEventListener('click', deleteEstimates);
revealBtn?.addEventListener('click', toggleVisibility);

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
    console.log("Sign Up Button Pressed");

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
        const data = await apiPost<User>('/api/signup', {
            name: enteredName
        });
        console.log("Server response:", data);

        currentUserId = data?.id ?? null;
        refreshUserList();
        navigateToGameView(enteredName);
    }
    catch (error) {
        console.error("Sign up failed:", error);
        if (txtDisplayName) {
            txtDisplayName.innerText = "Error signing up. Check console.";
        }
    }
}

//when user starts to type again, reset ui to default
nameBox?.addEventListener('input', () => {
    if (errorMsg) errorMsg.style.display = 'none';
    if (nameBox) nameBox.style.borderColor = '#cbd5e1';
});

//when user selectes a card on screen
async function selectCard(button: HTMLButtonElement, value: string) {
    console.log("Card selected: ", value);

    //highlight selected card
    const allCards = document.querySelectorAll('.poker-card-btn');
    allCards.forEach(card => card.classList.remove('selected'));
    button.classList.add('selected');

    if (!currentUserId) {
        console.error("Cannot submit estimate, no user signed in");
        return;
    }

    try {
        const response = await apiPost<User>('/api/estimation', {
            userId: currentUserId,
            estimation: value
        });
        console.log("Server Response: ", response);
        refreshUserList();
    }
    catch (error) {
        console.error("Estimate submission failed: ", error);
    }
}

(window as any).selectCard = selectCard;

//when any user clicks delete estimates
async function deleteEstimates() {
    try {
        console.log("Deleting");
        const response = await apiPost('/api/resetEstimation', {});
        console.log("Reset response: ", response);
    }
    catch (error) {
        console.error("Reset Failed: ", error);
    }
}

function checkVotingComplete(users: User[]) {
    let complete: Boolean = true;
    users.forEach(user => {
        if(user.estimation === null){
            complete = false;
        }
    });
    return complete;
}

//toggles visibility from true to false or viceversa
async function toggleVisibility() {
    try {
        const data = await apiGet<UsersResponse>('/api/users');

        if (!checkVotingComplete(data.users)) {
            console.log("Not everyone has voted yet");
            return;
        }

        const response = await apiPost<{ visible: boolean }>('/api/toggleVisibility', {});
        console.log("Toggle Response: ", response);
    }
    catch (error) {
        console.error("Toggle failed: ", error);
    }
    refreshUserList();
}

//refreshes user list when a change is made
async function refreshUserList() {
    try {
        const data = await apiGet<UsersResponse>('/api/users');
        renderUserList(data.users, data.visible);
    }
    catch (error) {
        console.error("Failed to refresh user list: ", error);
    }
}


const tbody = document.getElementById('players-list-body');

//display all users
function renderUserList(users: User[], visible: boolean) {

    if (!revealBtn) {
        return;
    }

    revealBtn.innerHTML = visible ? 'Hide' : 'Show';

    if (checkVotingComplete(users)) {
            revealBtn.style.borderColor = '';
        } 
    else {
        revealBtn.style.borderColor = '#ef4444';
    }
    createRows(users, visible);
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