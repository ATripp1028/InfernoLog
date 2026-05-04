import { useAuth } from "../context/AuthContext";

export function List() {
    const { user, signOut } = useAuth();

    return (
        <div style={{ padding: '24px' }}>
            <h1>The List</h1>
            <p>Welcome, {user!.username}</p>
            <button onClick={signOut}>Sign out</button>
        </div>
    );
}
