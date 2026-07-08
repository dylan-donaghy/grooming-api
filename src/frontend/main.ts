import { apiPost , apiGet} from "./api.ts";
import { type User } from "../routes/users.ts"

const socket = new WebSocket('ws://localhost:3000');

socket.addEventListener('open', () => {
    console.log("Connected to server via webSocket");
});

socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    console.log("Message received from server: ", message);
    refreshUserList();
});

let currentUserId: string | null = null;

// 1. Grab DOM elements globally at the top
const errorMsg = document.querySelector('.input-group p') as HTMLParagraphElement | null;
const signUpFrom = document.getElementById('login-view') as HTMLFormElement | null;
const nameBox = document.getElementById('usernameInput') as HTMLInputElement | null;
const txtDisplayName = document.getElementById('responseDisplay') as HTMLLabelElement | null;
const deleteEstimatesBtn = document.getElementById('delete-btn') as HTMLButtonElement | null;
const revealBtn = document.getElementById('reveal-btn') as HTMLButtonElement | null;

signUpFrom?.addEventListener('submit', sendSignUp);
deleteEstimatesBtn?.addEventListener('click', deleteEstimates);
revealBtn?.addEventListener('click', toggleVisibility);


function showSignUpError(message: string): void {
    if (errorMsg && nameBox) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block'; 
        nameBox.style.borderColor = '#ef4444';
    }
}

async function sendSignUp(e: any) {
    e.preventDefault()
    console.log("Sign Up Button Pressed");

    if (!nameBox) {
        console.error("Could not find usernameInput element");
        return;
    }

    //Reset UI
    if (errorMsg) {
        errorMsg.style.display = 'none';
        nameBox.style.borderColor = '#cbd5e1'; 
    }

    //Grab and trim the value
    const enteredName = nameBox.value.trim();

    if (enteredName === "") {
        showSignUpError("A name must be entered.");
        nameBox.value = '';
        return; 
    }
    
    if (enteredName.length < 2) {
        showSignUpError("Name must be at least 2 characters long.");
        nameBox.value = '';
        return;
    }
    
    if (enteredName.length > 30) {
        showSignUpError("Name cannot be longer than 30 characters.");
        nameBox.value = '';
        return;
    }

    try {
        const data = await apiPost<User>('/api/signup', {
            name: enteredName
        });

        console.log("Server response:", data);

        //Remember this user's ID for later requests
        currentUserId = data?.id ?? null;
        refreshUserList();

        document.getElementById('login-view')?.classList.add('hidden');
        document.getElementById('game-view')?.classList.remove('hidden');

        const currentPlayerLabel = document.getElementById('current-player-name');
        if (currentPlayerLabel) {
            currentPlayerLabel.innerText = enteredName;
        }

    } catch (error) {
        console.error("Sign up failed:", error);
        if (txtDisplayName) {
            txtDisplayName.innerText = "Error signing up. Check console.";
        }
    }
}

//Clear the red border when the user starts typing again
nameBox?.addEventListener('input', () => {
    if (errorMsg) errorMsg.style.display = 'none';
    if (nameBox) nameBox.style.borderColor = '#cbd5e1';
});

async function selectCard(button: HTMLButtonElement, value: string){
    console.log("Card selected: ", value);
    
    const allCards = document.querySelectorAll('.poker-card-btn');
    allCards.forEach(card => card.classList.remove('selected'));
    button.classList.add('selected');

    if(!currentUserId){
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
    catch(error){
        console.error("Estimate submission failed: ", error);
    }
}

(window as any).selectCard = selectCard;


//Clear all estimates
async function deleteEstimates(){
    try {
        console.log("Deleting");
        const response = await apiPost('/api/resetEstimation', {});
        console.log("Reset response: ", response);
    }
    catch (error){
        console.error("Reset Failed: ", error);
    }
}

(window as any).deleteEstimates = deleteEstimates;

//Toggle Visibility of all estimates
async function toggleVisibility() {
    try {
        const response = await apiPost<{ visible: boolean }>('/api/toggleVisibility', {} );
            console.log("Toggle Response: ", response);

            if(!revealBtn) return;           

            if(response.visible === true){
                revealBtn.innerHTML = 'Hide';
            }
            else{
                revealBtn.innerHTML = 'Show';
            }
        }
    catch(error){
        console.error("Toggle failed: " ,error);
    }
    
    refreshUserList();
}

(window as any).toggleVisibility = toggleVisibility;

type UsersResponse = {
    users: User[];
    visible: boolean;
}

async function refreshUserList(){
    try{
        const data = await apiGet<UsersResponse>('/api/users');
        renderUserList(data.users, data.visible);
    }
    catch (error) {
        console.error("Failed to refresh user list: ",error);
    }
}

function renderUserList(users: User[], visible: boolean){
    const tbody = document.getElementById('players-list-body');
    
    if(!tbody){
        return;
    }

    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = user.name;

        const voteCell = document.createElement('td');
        voteCell.style.textAlign = 'right';

        const badge = document.createElement('span');
        badge.classList.add('vote-badge');

        if (user.estimation === null) {
            badge.textContent = '-';
        } 
        else if (visible) {
            badge.textContent = user.estimation;
        } 
        else {
            badge.textContent = '?';
            badge.classList.add('hidden-vote');
        }

        voteCell.appendChild(badge);
        row.appendChild(nameCell);
        row.appendChild(voteCell);
        tbody.appendChild(row)
    })
}