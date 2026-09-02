import { app } from "./app";

const port = Number(Bun.env.API_PORT ?? 8080);

app.listen({ hostname: "0.0.0.0", port });

console.log(`X105 receiver running at http://0.0.0.0:${app.server?.port}`);
