export default async function handler() {
  return new Response(JSON.stringify({ supabaseAuth: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
