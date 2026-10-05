import { ArrowLeft, Boxes } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";

export function NotFoundPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const title = status === 404 ? "Page not found" : "Something went wrong";

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-slate-100">
      <div className="w-full max-w-xl border-y border-line py-12 text-center">
        <Boxes className="mx-auto h-8 w-8 text-mint" />
        <div className="mt-5 font-mono text-sm text-steel">{status}</div>
        <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
        <p className="mt-3 text-steel">The requested CodeMesh page is unavailable.</p>
        <Link className="mt-6 inline-flex items-center gap-2 rounded bg-mint px-4 py-2 font-semibold text-ink" to="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Return to Dashboard
        </Link>
      </div>
    </main>
  );
}
