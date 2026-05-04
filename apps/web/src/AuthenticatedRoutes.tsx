import { useAuth } from "./context/AuthContext";
import { Routes, Route, Navigate } from "react-router-dom";
import { List } from "./pages/List";
import { Loading } from "./pages/Loading";

export function AuthenticatedRoutes() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <Loading />
        )
    }

    if (!user!.onboardingCompleted) {
        return (
            <Navigate to="/onboarding" replace />
        )
    }

    if (!user) {
        return (
            <Navigate to="/login" replace />
        )
    }

    return (
        <Routes>
            <Route
                path="/list"
                element={<List />}
            />

            <Route
                path="*"
                element={<Navigate to="/list" replace />}
            />
        </Routes>
    )
}