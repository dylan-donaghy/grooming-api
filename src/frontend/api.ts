export async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const response = await window.fetch(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const { data, errors } = await response.json();

    if (!response.ok) {
        throw new Error(
            errors?.map((e: any) => e.message).join('\n') ?? 'unknown error'
        );
    }

    return data;
}

export async function apiGet<T>(path: string,): Promise<T> {
    const response = await window.fetch(`http://localhost:3000${path}`, {
        method: 'GET'
    });

    const { data, errors } = await response.json();

    if(!response.ok){
        throw new Error(
            errors?.map((e: any) => e.message).join('\n') ?? 'unknown error'
        );
    }
    return data;
}