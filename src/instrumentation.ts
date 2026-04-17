export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureAutonomyBootState } = await import("./lib/autonomy/service");
  await ensureAutonomyBootState();
}
