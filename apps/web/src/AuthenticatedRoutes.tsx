import { useAuth } from "./context/AuthContext";
import { Routes, Route, Navigate } from "react-router-dom";

export function AuthenticatedRoutes() {
    const { user, loading, signIn, signOut } = useAuth()

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <p>Loading...</p>
            </div>
        )
    }

    if (!user) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px' }}>
                <h1>InfernoLog</h1>
                <button onClick={signIn}>Sign in with Google</button>
            </div>
        )
    }

    return (
        <Routes>
            {/* Onboarding gate — redirect to onboarding if not completed */}
            <Route
                path="/onboarding"
                element={<Navigate to="/list" replace />}
            />

            {/* Protected routes — redirect to onboarding if not completed */}
            <Route
                path="/list"
                element={<div style={{ padding: '24px' }}><h1>The List</h1><p>Welcome, {user.username}</p><button onClick={signOut}>Sign out</button></div>}
            />

            {/* Default redirect */}
            <Route
                path="*"
                element={<Navigate to="/list" replace />}
            />
        </Routes>
    )
}