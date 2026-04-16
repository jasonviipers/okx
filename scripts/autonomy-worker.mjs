const defaultUrl = "http://127.0.0.1:3000/api/ai/system/autonomy/worker";
const workerUrl = process.env.AUTONOMY_WORKER_URL || defaultUrl;
const headers = {
  "Content-Type": "application/json",
};

if (process.env.CRON_SECRET) {
  headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
}

const response = await fetch(workerUrl, {
  method: "POST",
  headers,
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(
    `[autonomy-worker] Request failed with status ${response.status}: ${JSON.stringify(payload)}`,
  );
  process.exit(1);
}

console.log(
  `[autonomy-worker] Worker request succeeded: ${JSON.stringify(payload)}`,
);
