import { useAuth } from "../context/AuthContext";
import { Loading } from "./Loading";

export function Ranking() {
  const { loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Ranking</h1>
      <p className="mt-2 text-text-secondary">List of ranked items</p>
    </div>
  );
}
