import { useAuth } from "../context/AuthContext";
import { Loading } from "./Loading";

export function Log() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Log</h1>
      <p className="mt-2 text-text-secondary">Logged events appear here</p>
    </div>
  );
}
