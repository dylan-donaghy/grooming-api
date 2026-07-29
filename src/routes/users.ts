export type User = {
    id: string;
    name: string;
    estimation: string | null; //null = hasn't voted yet, otherwise a card value
}

//The complete board. Clients render from this and nothing else, so there is one
//source of truth instead of each tab assembling its own view.
export type BoardState = {
    users: User[];
    visible: boolean;
    version: number;
}

//In-memory, resets whenever the server restarts
const users: User[] = [];

let nextId = 1; //simple incrementing ID
let visibleEstimate = false; //global toggle, not tied to any one user

//Incremented on every mutation. Clients discard any snapshot whose version is
//not newer than the last one they rendered, so a slow response can't overwrite
//a fresh one and leave that tab showing stale votes.
let version = 0;

//Returns the whole board as one consistent snapshot
export function getState(): BoardState {
    return {
        users: users.map(u => ({ ...u })),
        visible: visibleEstimate,
        version
    };
}

//Creates a new user with a unique id and no estimation yet
export function addUser(name: string): User {
    const newUser: User = {
        id: String(nextId++),
        name,
        estimation: null
    };
    users.push(newUser);
    version++;
    return newUser;
}

//Removes a user, returns whether there was anything to remove
export function removeUser(id: string): boolean {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return false;

    users.splice(index, 1);
    version++;

    //Losing the last person we were waiting on shouldn't auto-reveal the room
    if (users.length === 0) {
        visibleEstimate = false;
    }
    return true;
}

//Finds a user by id
export function findUser(id: string): User | undefined {
    return users.find(u => u.id === id);
}

//Records a vote, returns the updated user or undefined if the id is unknown
export function setEstimation(id: string, estimation: string | null): User | undefined {
    const user = findUser(id);
    if (!user) return undefined;

    user.estimation = estimation;
    version++;
    return user;
}

//Clears every user's estimation and hides the board again. Starting a fresh
//round with the previous round still revealed would leak each vote as it lands.
export function resetAllEstimations(): void {
    users.forEach(user => {
        user.estimation = null;
    });
    visibleEstimate = false;
    version++;
}

//Reads the current show/hide state
export function getVisibility(): boolean {
    return visibleEstimate;
}

//Sets show/hide to an explicit value. Callers say what they want rather than
//asking for an inversion, so two people acting at once can't cancel each other out.
export function setVisibility(visible: boolean): boolean {
    if (visible !== visibleEstimate) {
        visibleEstimate = visible;
        version++;
    }
    return visibleEstimate;
}
