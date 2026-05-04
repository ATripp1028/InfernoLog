import { useAuth } from "../context/AuthContext";
import { Loading } from "./Loading";

export function Settings() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-text-secondary">Manage your settings</p>
    </div>
  );
}
