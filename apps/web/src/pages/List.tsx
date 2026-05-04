import { useAuth } from "../context/AuthContext";
import { Loading } from "./Loading";

export function List() {
    const { user, loading, signOut } = useAuth();

    if (loading) {
        return <Loading />;
    }

    return (
        <div style={{ padding: '24px' }}>
            <h1>The List</h1>
            <p>Welcome, {user!.username}</p>
            <button onClick={signOut}>Sign out</button>
        </div>
    );
}
