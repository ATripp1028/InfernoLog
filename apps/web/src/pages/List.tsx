import { useMe } from "../lib/api/me";
import { PageLoading } from "../components/PageLoading";

export function List() {
  const me = useMe();

  if (me.isPending || !me.data) {
    return <PageLoading />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">List</h1>
      <p className="mt-2 text-text-secondary">Welcome, {me.data.username}</p>
    </div>
  );
}
