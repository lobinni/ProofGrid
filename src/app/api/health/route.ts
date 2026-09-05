export const dynamic = "force-dynamic";

// The app is fully client-side against the GenLayer RPCs - there is no server
// database to probe. Health = the Next server is up and serving.
export async function GET() {
  return Response.json({ ok: true });
}
