export async function POST() {
  return new Response(
    JSON.stringify({ error: "Route disabled" }),
    { status: 410 }
  );
}
