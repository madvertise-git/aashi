import { createApp } from "./app";
import { CONFIG, type Config } from "./platform";

const app = await createApp();
const { port } = app.get<Config>(CONFIG);
await app.listen(port);
console.log(`API listening on http://localhost:${port}`);
