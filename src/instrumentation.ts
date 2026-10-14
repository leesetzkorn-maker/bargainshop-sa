// Limit native image-processing caches on the 1 GB production container.
// This does not change source photos, their appearance, or checkout behaviour.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const sharp = (await import("sharp")).default;
  sharp.cache({ memory: 16, files: 0, items: 16 });
  sharp.concurrency(1);

  if (process.env.BARGAINSHOP_MEMORY_DIAGNOSTICS === "1") {
    const timer = setInterval(() => {
      const { rss, heapUsed, external } = process.memoryUsage();
      const mb = (n: number) => Math.round(n / 1024 / 1024);
      console.info(`[memory] pid=${process.pid} rss=${mb(rss)}MB heap=${mb(heapUsed)}MB external=${mb(external)}MB`);
    }, 120000);
    timer.unref();
  }
}
