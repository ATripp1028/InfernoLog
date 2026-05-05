import { useAuth } from "../context/AuthContext";
import { Loading } from "./Loading";

export function List() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">List</h1>
      <p className="mt-2 text-text-secondary">Welcome, {user!.username}</p>
    </div>
  );
}
