export type User = {
    id: string;
    name: string;
    estimation: string | null; //null = hasn't voted yet, otherwise a card value
}

//In-memory, resets whenever the server restarts
const users: User[] = [];

let nextId = 1; //simple incrementing ID
let visibleEstimate = false; //global toggle, not tied to any one user

//Creates a new user with a unique id and no estimation yet
export function addUser(name: string): User {
    const newUser: User = {
        id: String(nextId++),
        name,
        estimation: null
    };
    users.push(newUser);
    return newUser;
}

//Finds a user by id
export function findUser(id: string): User | undefined{
    return users.find(u => u.id === id);
}

//Returns every signedup user
export function getAllUsers(): User[]{
    return users;
}

//Clears every user's estimation back to null
export function resetAllEstimations(): void {
    users.forEach(user => {
        user.estimation = null;
    });
}

//Reads the current show/hide state
export function getVisibility(): boolean {
    return visibleEstimate;
}

//Flips the show/hide state and returns the new value
export function toggleVisibility(): boolean {
    visibleEstimate = !visibleEstimate;
    return visibleEstimate;
}