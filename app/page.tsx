export default function Home() {
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background px-8 py-16 text-foreground">
      <section className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Welcome to</p>
        <h1 className="text-4xl font-semibold leading-tight">deltaX</h1>
      </section>
      <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-300">
        Start building by wiring up your app routes inside the <code>app</code> directory. Shared
        utilities live under <code>lib</code>, and database schema belongs in <code>db/schema</code>
        .
      </p>
    </main>
  );
}
