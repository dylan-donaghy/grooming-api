export type User = {
    id: string;
    name: string;
    estimation: string | null;
}

const users: User[] = [];

let nextId = 1;
let visibleEstimate = false;

export function addUser(name: string): User {
    const newUser: User = {
        id: String(nextId++),
        name,
        estimation: null
    };
    users.push(newUser);
    return newUser;
}

export function findUser(id: string): User | undefined{
    return users.find(u => u.id === id);
}

export function getAllUsers(): User[]{
    return users;
}

export function resetAllEstimations(): void {
    users.forEach(user => {
        user.estimation = null;
    });
}

export function getVisibility(): boolean {
    return visibleEstimate;
}

export function toggleVisibility(): boolean {
    visibleEstimate = !visibleEstimate;
    return visibleEstimate;
}